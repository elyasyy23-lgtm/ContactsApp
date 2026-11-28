package expo.modules.cctvplayback

import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** A recorded file as reported by OPFileQuery (1440). */
data class ArchiveFile(
  val fileName: String,
  val begin: String,
  val end: String,
  val size: Long
)

/** The result of a best-effort archive lookup across both codecs. */
data class ArchiveQuery(
  val files: List<ArchiveFile>,
  val attempts: List<String>
)

/**
 * Minimal Xiongmai / XMEye (Sofia) DVRIP client.
 *
 * Wire format (all little-endian, 20-byte header):
 *
 *   0    head       always 0xFF
 *   1    version    0 for JSON bodies
 *   2-3  padding
 *   4-7  session    0 before login, the SessionID from the login reply after
 *   8-11 sequence   free-running counter
 *   12-13 padding   (media packets reuse these as total/current fragment)
 *   14-15 message id (uint16)
 *   16-19 body length (uint32), JSON bodies carry a trailing 0x0A 0x00
 *
 * Archive download is a three-step conversation:
 *
 *   1440 OPFileQuery   -> which file covers the requested moment
 *   1424 OPPlayBack    -> Action "Claim"
 *   1420 OPPlayBack    -> Action "DownloadStart" (first chunk + continuation
 *                         packets, terminated by a packet whose length is 0)
 *   1420 OPPlayBack    -> Action "DownloadStop"
 *
 * Only the raw elementary stream is written; no container is invented here.
 */
class DvripClient(
  private val host: String,
  private val port: Int,
  private val user: String,
  private val password: String,
  private val timeoutMs: Int = 8000,
  /** 0 = main stream, 1 = extra/sub stream (much smaller files, faster start). */
  private val streamType: Int = 0
) {
  companion object {
    private const val HEADER_SIZE = 20
    private const val MAX_PACKET_BYTES = 32 * 1024 * 1024
    private const val CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

    /** Assumed picture rate of the recorder (see [framesFor]). */
    const val DEFAULT_FPS = 25

    private const val MSG_LOGIN = 1000
    private const val MSG_CONFIG = 1040
    private const val MSG_FILE_QUERY = 1440
    private const val MSG_PLAYBACK = 1420
    private const val MSG_PLAYBACK_CLAIM = 1424

    /**
     * DVRIP 1550 OPNetKeyboard: presses the keys of the DVR's OWN keypad.
     * It is the only documented channel that can drive what the recorder shows
     * on its HDMI/VGA monitor — playback of a recording on that monitor is
     * reachable only through this remote keypad, never through a stream call.
     */
    private const val MSG_NET_KEYBOARD = 1550

    const val KEY_RETURN = 27
    const val KEY_PLAY = 30
    const val KEY_SEARCH = 41

    /** DVRIP return codes that mean "the request succeeded". */
    private val OK_CODES = setOf(100, 515)

    private val RET_TEXT = mapOf(
      100 to "ok",
      101 to "socket closed",
      106 to "wrong user or password",
      107 to "no permission",
      108 to "request timed out",
      109 to "search failed",
      110 to "no matching file",
      203 to "wrong password",
      607 to "device busy"
    )

    /** sofia_hash: the MD5 digest folded pairwise into 8 characters. */
    fun sofiaHash(value: String): String {
      val digest = MessageDigest.getInstance("MD5").digest(value.toByteArray(Charsets.UTF_8))
      val out = StringBuilder(8)
      var index = 0
      while (index + 1 < digest.size) {
        val sum = (digest[index].toInt() and 0xFF) + (digest[index + 1].toInt() and 0xFF)
        out.append(CHARS[sum % CHARS.length])
        index += 2
      }
      return out.toString()
    }

    /** DVR timestamps are device-local wall clock, never UTC. */
    fun stamp(date: Date): String =
      SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(date)

    /** Parses a device timestamp back into device-local milliseconds. */
    fun parseStamp(value: String): Long? =
      try {
        SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).parse(value.trim())?.time
      } catch (_: Exception) {
        null
      }

    /**
     * The recorder writes one primary slice per picture, so a frame count is a
     * clock: `framesFor(10 min, 25 fps)` is the number of pictures in the clip.
     * PAL/D1 DVRs run at 25 fps; a mismatch only shortens or lengthens the tail
     * of the clip, never the requested start.
     */
    fun framesFor(milliseconds: Long, fps: Int = DEFAULT_FPS): Long =
      Math.max(1L, Math.round(milliseconds / 1000.0 * fps))

    fun describeRet(ret: Int): String = RET_TEXT[ret] ?: "device returned $ret"
  }

  private var socket: Socket? = null
  private var input: InputStream? = null
  private var output: OutputStream? = null

  private var session = 0
  private var sequence = 0
  private var aliveIntervalMs = 30_000L

  @Volatile
  var cancelled = false

  /** Pictures counted in the segment currently being written. */
  var frames = 0L
    private set

  /** Byte window shared by the next `countSlices` call (a start code may split). */
  private var scanTail = ByteArray(0)

  val isConnected: Boolean get() = socket?.isConnected == true

  fun connect() {
    val s = Socket()
    s.tcpNoDelay = true
    try { s.receiveBufferSize = 1024 * 1024 } catch (_: Exception) { }
    s.connect(InetSocketAddress(host, port), timeoutMs)
    s.soTimeout = timeoutMs * 4
    socket = s
    input = s.getInputStream()
    output = s.getOutputStream()
  }

  fun close() {
    try { output?.close() } catch (_: Exception) { }
    try { input?.close() } catch (_: Exception) { }
    try { socket?.close() } catch (_: Exception) { }
    output = null
    input = null
    socket = null
  }

  val keepAliveMs: Long get() = aliveIntervalMs

  // ---------------------------------------------------------------- transport

  private fun putIntLE(target: ByteArray, offset: Int, value: Int) {
    target[offset] = (value and 0xFF).toByte()
    target[offset + 1] = ((value ushr 8) and 0xFF).toByte()
    target[offset + 2] = ((value ushr 16) and 0xFF).toByte()
    target[offset + 3] = ((value ushr 24) and 0xFF).toByte()
  }

  private fun putShortLE(target: ByteArray, offset: Int, value: Int) {
    target[offset] = (value and 0xFF).toByte()
    target[offset + 1] = ((value ushr 8) and 0xFF).toByte()
  }

  private fun readIntLE(buffer: ByteArray, offset: Int): Int =
    (buffer[offset].toInt() and 0xFF) or
      ((buffer[offset + 1].toInt() and 0xFF) shl 8) or
      ((buffer[offset + 2].toInt() and 0xFF) shl 16) or
      ((buffer[offset + 3].toInt() and 0xFF) shl 24)

  private fun readShortLE(buffer: ByteArray, offset: Int): Int =
    (buffer[offset].toInt() and 0xFF) or ((buffer[offset + 1].toInt() and 0xFF) shl 8)

  private fun readExact(count: Int): ByteArray {
    if (count < 0 || count > MAX_PACKET_BYTES) {
      throw DvripException("device announced an impossible packet size ($count)")
    }
    val source = input ?: throw DvripException("socket is closed")
    val collected = ByteArray(count)
    var read = 0
    while (read < count) {
      val chunk = source.read(collected, read, count - read)
      if (chunk <= 0) throw DvripException("device closed the connection")
      read += chunk
    }
    return collected
  }

  private fun sendPacket(messageId: Int, body: ByteArray) {
    val sink = output ?: throw DvripException("socket is closed")
    val header = ByteArray(HEADER_SIZE)
    header[0] = 0xFF.toByte()
    header[1] = 0x00
    putIntLE(header, 4, session)
    putIntLE(header, 8, sequence)
    putShortLE(header, 14, messageId)
    putIntLE(header, 16, body.size)
    sequence += 1
    sink.write(header)
    sink.write(body)
    sink.flush()
  }

  private fun sendJson(messageId: Int, payload: JSONObject): Int {
    val json = payload.toString().toByteArray(Charsets.UTF_8)
    val body = ByteArray(json.size + 2)
    System.arraycopy(json, 0, body, 0, json.size)
    body[json.size] = 0x0A
    body[json.size + 1] = 0x00
    sendPacket(messageId, body)
    val header = readExact(HEADER_SIZE)
    return readIntLE(header, 16)
  }

  private fun sendAndRead(messageId: Int, payload: JSONObject): JSONObject {
    val length = sendJson(messageId, payload)
    val raw = readExact(length)
    val text = String(raw, Charsets.UTF_8).trim().trimEnd('\u0000').trim()
    return try {
      JSONObject(text)
    } catch (error: Exception) {
      JSONObject().put("Ret", -1)
    }
  }

  /**
   * One request/response round. The reply body is returned so callers can read
   * either JSON or the first binary chunk.
   */
  private fun exchange(messageId: Int, payload: JSONObject): ByteArray {
    val length = sendJson(messageId, payload)
    return readExact(length)
  }

  private fun retOf(raw: ByteArray): Int {
    val text = String(raw, Charsets.UTF_8).trim().trimEnd('\u0000').trim()
    return try {
      JSONObject(text).optInt("Ret", -1)
    } catch (error: Exception) {
      -1
    }
  }

  // ------------------------------------------------------------------- calls

  fun login() {
    val payload = JSONObject()
      .put("EncryptType", "MD5")
      .put("LoginType", "DVRIP-Web")
      .put("PassWord", sofiaHash(password))
      .put("UserName", user)

    val reply = sendAndRead(MSG_LOGIN, payload)
    val ret = reply.optInt("Ret", -1)
    if (ret !in OK_CODES) {
      throw DvripException("login failed: ${describeRet(ret)}")
    }
    val sessionId = reply.optString("SessionID", "")
    if (sessionId.isNotEmpty()) {
      session = parseSession(sessionId)
    }
    val alive = reply.optInt("AliveInterval", 0)
    if (alive > 0) aliveIntervalMs = (alive * 1000L).coerceAtLeast(10_000L)
  }

  // ---------------------------------------------------------- monitor keypad

  /**
   * Presses one key on the recorder's own keypad (DVRIP 1550 OPNetKeyboard).
   * iState 0 = key down, 1 = key up; both are sent so the on-screen menu
   * registers a real press.
   */
  private fun pressKey(value: Int): Int {
    var ret = -1
    for (state in 0..1) {
      val payload = JSONObject()
        .put("Name", "OPNetKeyboard")
        .put(
          "OPNetKeyboard",
          JSONObject()
            .put("Status", if (state == 0) "KeyDown" else "KeyUp")
            .put("Value", value)
        )
      ret = sendAndRead(MSG_NET_KEYBOARD, payload).optInt("Ret", -1)
      if (ret !in OK_CODES) return ret
    }
    return ret
  }

  /** The keys needed to show [startMs] on the monitor: SEARCH, digits, RET, PLAY. */
  fun monitorKeySequence(startMs: Long): List<Int> {
    val stamp = java.text.SimpleDateFormat("yyyyMMddHHmmss", java.util.Locale.US)
      .format(Date(startMs))
    val keys = ArrayList<Int>(stamp.length + 3)
    keys.add(KEY_SEARCH)
    for (character in stamp) keys.add(character - '0')
    keys.add(KEY_RETURN)
    keys.add(KEY_PLAY)
    return keys
  }

  /**
   * Opens record search on the recorder's monitor, types the wanted moment and
   * starts playback there. Returns every (key, return code) pair so the app can
   * show exactly which press the box refused.
   */
  fun playArchiveOnMonitor(startMs: Long): List<Pair<Int, Int>> {
    val results = ArrayList<Pair<Int, Int>>()
    for (key in monitorKeySequence(startMs)) {
      val ret = pressKey(key)
      results.add(key to ret)
      if (ret !in OK_CODES) {
        throw DvripException("key $key rejected: ${describeRet(ret)}")
      }
    }
    return results
  }

  /** The device sends "0x00000000" but some firmwares send plain decimals. */  private fun parseSession(value: String): Int {
    val text = value.trim().removePrefix("0x").removePrefix("0X")
    return try {
      if (value.trim().startsWith("0x", ignoreCase = true)) text.toLong(16).toInt() else text.toLong().toInt()
    } catch (error: Exception) {
      try { text.toLong(16).toInt() } catch (retry: Exception) { 0 }
    }
  }

  private fun queryJson(begin: String, end: String, channel: Int, type: String): JSONObject =
    JSONObject()
      .put("Name", "OPFileQuery")
      .put(
        "OPFileQuery",
        JSONObject()
          .put("BeginTime", begin)
          .put("Channel", channel)
          .put("DriverTypeMask", "0x0000FFFF")
          .put("EndTime", end)
          .put("Event", "*")
          .put("StreamType", "0x00000000")
          .put("Type", type)
      )

  private fun filesFrom(reply: JSONObject): List<ArchiveFile> {
    val block = reply.opt("OPFileQuery") ?: return emptyList()
    val array: JSONArray = when (block) {
      is JSONArray -> block
      is JSONObject -> block.optJSONArray("File") ?: JSONArray()
      else -> JSONArray()
    }
    val files = ArrayList<ArchiveFile>(array.length())
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val name = item.optString("FileName", "")
      if (name.isEmpty()) continue
      files.add(
        ArchiveFile(
          fileName = name,
          begin = item.optString("BeginTime", ""),
          end = item.optString("EndTime", ""),
          size = item.optLong("FileLength", 0L)
        )
      )
    }
    return files
  }

  /** OPFileQuery (1440) with the 64-row pagination the device uses. */
  fun queryFiles(
    begin: String,
    end: String,
    channel: Int,
    type: String = "h264"
  ): List<ArchiveFile> {
    var cursor = begin
    val collected = ArrayList<ArchiveFile>()
    var guard = 0
    while (guard < 40) {
      guard += 1
      val reply = sendAndRead(MSG_FILE_QUERY, queryJson(cursor, end, channel, type))
      val ret = reply.optInt("Ret", -1)
      if (ret !in OK_CODES) {
        throw DvripException("file query ($type) refused: ${describeRet(ret)} ($ret)")
      }
      val page = filesFrom(reply)
      if (page.isEmpty()) break
      collected.addAll(page)
      if (page.size < 64) break
      val next = page.last().begin
      if (next.isEmpty() || next == cursor) break
      cursor = next
    }
    return collected
  }

  /**
   * Some firmware indexes H.265 recordings under a different Type string. Try
   * both, keep every answer, and never hide a device Ret behind an empty list.
   */
  fun queryBothFiles(begin: String, end: String, channel: Int): ArchiveQuery {
    val attempts = ArrayList<String>()
    for (type in listOf("h264", "h265")) {
      try {
        val files = queryFiles(begin, end, channel, type)
        attempts.add("$type=${files.size}")
        if (files.isNotEmpty()) return ArchiveQuery(files, attempts)
      } catch (error: DvripException) {
        attempts.add("$type=${error.message}")
      }
    }
    return ArchiveQuery(emptyList(), attempts)
  }

  /**
   * Picks the file that actually contains [moment]; otherwise the nearest file
   * that starts at or before it, otherwise the nearest afterwards.
   */
  fun pickFile(files: List<ArchiveFile>, moment: String): ArchiveFile? {
    if (files.isEmpty()) return null
    val covering = files.firstOrNull { it.begin <= moment && it.end >= moment }
    if (covering != null) return covering
    val before = files.filter { it.begin <= moment }.maxByOrNull { it.begin }
    if (before != null) return before
    return files.minByOrNull { it.begin }
  }

  private fun playbackParameter(file: ArchiveFile): JSONObject =
    JSONObject()
      .put("PlayMode", "ByName")
      .put("FileName", file.fileName)
      .put("StreamType", if (streamType == 1) 1 else 0)
      .put("Value", 0)
      .put("TransMode", "TCP")

  private fun playbackBody(
    file: ArchiveFile,
    action: String,
    startTime: String = file.begin
  ): JSONObject =
    JSONObject()
      .put("Name", "OPPlayBack")
      .put(
        "OPPlayBack",
        JSONObject()
          .put("Action", action)
          .put("Parameter", playbackParameter(file))
          .put("StartTime", startTime)
          .put("EndTime", file.end)
      )

  private fun claim(file: ArchiveFile, startTime: String = file.begin) {
    val reply = sendAndRead(MSG_PLAYBACK_CLAIM, playbackBody(file, "Claim", startTime))
    val ret = reply.optInt("Ret", -1)
    if (ret !in OK_CODES) throw DvripException("claim failed: ${describeRet(ret)}")
  }

  /**
   * The files that actually intersect the requested window, in playing order.
   *
   * A recording is not a neat ten minutes: this box writes files of roughly
   * thirty minutes, so a five-minutes-either-side window straddles two of them
   * about a quarter of the time. Playing both, back to back, is the only way to
   * cover the window; each one is claimed separately because the stream can
   * only be stopped by dropping the socket.
   */
  fun segmentsFor(files: List<ArchiveFile>, startMs: Long, endMs: Long): List<ArchiveFile> {
    val wanted = files.filter { file ->
      val begin = parseStamp(file.begin) ?: return@filter false
      val end = parseStamp(file.end) ?: return@filter false
      end > startMs && begin < endMs
    }
    return wanted.sortedBy { it.begin }
  }

  private fun countSlices(chunk: ByteArray) {
    val tail = scanTail
    val buffer =
      if (tail.isEmpty()) chunk
      else ByteArray(tail.size + chunk.size).also {
        System.arraycopy(tail, 0, it, 0, tail.size)
        System.arraycopy(chunk, 0, it, tail.size, chunk.size)
      }
    val size = buffer.size
    var index = 0
    while (index + 2 < size) {
      if (buffer[index].toInt() == 0 && buffer[index + 1].toInt() == 0) {
        if (buffer[index + 2].toInt() == 1 && index + 3 < size) {
          val type = buffer[index + 3].toInt() and 0x1F
          if (type == 1 || type == 5) frames += 1
          index += 4
          continue
        }
        if (
          buffer[index + 2].toInt() == 0 &&
          index + 4 < size &&
          buffer[index + 3].toInt() == 1
        ) {
          val type = buffer[index + 4].toInt() and 0x1F
          if (type == 1 || type == 5) frames += 1
          index += 5
          continue
        }
      }
      index += 1
    }
    scanTail =
      if (size >= 3) buffer.copyOfRange(size - 3, size)
      else buffer.copyOfRange(0, size)
  }

  /**
   * Appends the part of [file] that starts at [startMs] (a device timestamp) and
   * stops after `frameBudget` pictures or `byteLimit` bytes — whichever comes
   * first. Returns the bytes appended.
   */
  fun downloadRange(
    file: ArchiveFile,
    target: java.io.File,
    startMs: Long,
    frameBudget: Long,
    byteLimit: Long,
    onProgress: (Long) -> Unit = {}
  ): Long {
    target.parentFile?.mkdirs()
    var written = 0L
    java.io.FileOutputStream(target, true).use { sink ->
      written = pump(file, startMs, frameBudget, byteLimit, onProgress) { chunk ->
        sink.write(chunk)
      }
      sink.flush()
    }
    return written
  }

  /**
   * Same conversation as [downloadRange], but every packet is handed to [emit]
   * instead of a file. This is what lets the player start on the first frames:
   * the DVR answers `OPPlayBack` as one continuous Annex-B stream, so there is
   * nothing to wait for but the first chunk.
   */
  fun streamRange(
    file: ArchiveFile,
    startMs: Long,
    frameBudget: Long,
    byteLimit: Long,
    onProgress: (Long) -> Unit = {},
    emit: (ByteArray) -> Unit
  ): Long = pump(file, startMs, frameBudget, byteLimit, onProgress, emit)

  /**
   * One archive read: claim, start, forward packets, stop.
   *
   * Frames may be unreadable on a firmware that does not emit Annex-B slices;
   * after a few megabytes with no picture counted the byte limit takes over.
   */
  private fun pump(
    file: ArchiveFile,
    startMs: Long,
    frameBudget: Long,
    byteLimit: Long,
    onProgress: (Long) -> Unit,
    emit: (ByteArray) -> Unit
  ): Long {
    val begin = parseStamp(file.begin) ?: startMs
    val end = parseStamp(file.end) ?: startMs
    val moment = Math.min(Math.max(startMs, begin), Math.max(begin, end - 1000L))
    val startStamp = stamp(Date(moment))

    frames = 0L
    scanTail = ByteArray(0)
    claim(file, startStamp)
    val first = exchange(MSG_PLAYBACK, playbackBody(file, "DownloadStart", startStamp))
    // A refusal comes back as JSON instead of media bytes; surface the reason.
    if (first.isNotEmpty() && first[0] == '{'.code.toByte()) {
      val ret = retOf(first)
      throw DvripException("download refused: ${describeRet(ret)}")
    }
    var written = 0L
    var trustFrames = true
    try {
      if (first.isNotEmpty()) {
        emit(first)
        written += first.size
        countSlices(first)
        onProgress(written)
      }
      while (true) {
        if (cancelled) throw DvripException("cancelled")
        val header = readExact(HEADER_SIZE)
        val chunkLength = readIntLE(header, 16)
        if (chunkLength <= 0) break
        val chunk = readExact(chunkLength)
        emit(chunk)
        written += chunk.size
        countSlices(chunk)
        onProgress(written)
        if (trustFrames && frames == 0L && written > 4L * 1024L * 1024L) trustFrames = false
        if (trustFrames && frames >= frameBudget) break
        if (written >= byteLimit) break
      }
    } finally {
      try {
        sendAndRead(MSG_PLAYBACK, playbackBody(file, "DownloadStop", startStamp))
      } catch (_: Exception) {
        // The window is already delivered; a missing stop reply must not fail it.
      }
    }
    return written
  }

  /**
   * Reads one device configuration block (OPConfig 1040). Used to inspect what
   * this firmware exposes (e.g. whether a guest account exists) without ever
   * writing anything back to the recorder.
   */
  fun readConfig(name: String): JSONObject =
    sendAndRead(MSG_CONFIG, JSONObject().put("Name", name))

  /**
   * Downloads the whole file. `DownloadStart` answers with the first chunk in
   * the reply body; the rest arrives as further packets and ends with a
   * zero-length one.
   */
  fun download(
    file: ArchiveFile,
    target: java.io.File,
    onProgress: (Long) -> Unit = {}
  ): Long {
    claim(file)
    val first = exchange(MSG_PLAYBACK, playbackBody(file, "DownloadStart"))
    // A refusal comes back as JSON instead of media bytes; surface the reason.
    if (first.isNotEmpty() && first[0] == '{'.code.toByte()) {
      val ret = retOf(first)
      throw DvripException("download refused: ${describeRet(ret)}")
    }
    target.parentFile?.mkdirs()
    var written = 0L
    target.outputStream().use { sink ->
      if (first.isNotEmpty()) {
        sink.write(first)
        written += first.size
        onProgress(written)
      }
      while (true) {
        if (cancelled) throw DvripException("cancelled")
        val header = readExact(HEADER_SIZE)
        val chunkLength = readIntLE(header, 16)
        if (chunkLength <= 0) break
        val chunk = readExact(chunkLength)
        sink.write(chunk)
        written += chunk.size
        onProgress(written)
      }
      sink.flush()
    }
    try {
      sendAndRead(MSG_PLAYBACK, playbackBody(file, "DownloadStop"))
    } catch (_: Exception) {
      // The clip is already on disk; a missing stop reply must not fail it.
    }
    return written
  }

  /** Best-effort logout so the device frees the playback slot immediately. */
  fun logout() {
    try {
      sendAndRead(MSG_LOGIN, JSONObject().put("Name", "OPLogout"))
    } catch (_: Exception) {
      // ignore
    }
  }
}

class DvripException(message: String) : Exception(message)
