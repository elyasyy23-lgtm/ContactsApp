package expo.modules.cctvplayback

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.Date

/**
 * Downloads one archived clip from an Xiongmai/XMEye DVR over DVRIP and hands
 * it to VLC, which stays the shop owner's video player.
 *
 * VLC is launched with `FLAG_GRANT_READ_URI_PERMISSION` so it can read the
 * app-private clip through the FileProvider; a local file needs no
 * authentication, so VLC never shows its username/password dialog.
 *
 * The password comes from the app's own Settings screen at call time and is
 * never written to disk, logged, or returned to JS.
 */
class CctvPlaybackModule : Module() {
  companion object {
    private const val DEFAULT_PORT = 34567
    private const val MAX_CLIP_BYTES = 220L * 1024L * 1024L
    private const val WIDEN_MINUTES = 30
    private const val VLC_PACKAGE = "org.videolan.vlc"
  }

  @Volatile
  private var cancelRequested = false

  /** The client of the running download, so `stop()` can abort a blocked read. */
  @Volatile
  private var activeClient: DvripClient? = null

  /** The loopback server currently feeding the player (streaming mode). */
  @Volatile
  private var activeStream: ArchiveStreamServer? = null

  private fun asInt(value: Any?, fallback: Int): Int = when (value) {
    is Number -> value.toInt()
    is String -> value.trim().toIntOrNull() ?: fallback
    else -> fallback
  }

  /** Keeps the cache bounded: only the two newest clips survive. */
  /**
   * Rewrites a raw Annex-B recording as MPEG-TS so any Android player accepts
   * it. Reads in 64 KB blocks; a ten minute clip is ~40 MB, so memory stays flat.
   */
  private fun muxToTs(source: java.io.File): java.io.File {
    val target = java.io.File(source.parentFile, source.nameWithoutExtension + ".ts")
    val muxer = TsMuxer()
    java.io.FileInputStream(source).use { input ->
      java.io.FileOutputStream(target).use { output ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          val piece = if (read == buffer.size) buffer else buffer.copyOf(read)
          val ts = muxer.push(piece)
          if (ts.isNotEmpty()) output.write(ts)
        }
        val tail = muxer.finish()
        if (tail.isNotEmpty()) output.write(tail)
      }
    }
    if (target.length() <= 0L) {
      try { target.delete() } catch (_: Exception) { }
      throw DvripException("remux produced an empty file")
    }
    try { source.delete() } catch (_: Exception) { }
    return target
  }

  private fun pruneClips(directory: File) {
    val clips = directory.listFiles { file -> file.isFile && file.name.startsWith("clip-") }
      ?.sortedByDescending { it.lastModified() } ?: return
    clips.drop(2).forEach { clip -> try { clip.delete() } catch (_: Exception) { } }
  }

  private fun asLong(value: Any?): Long? = when (value) {
    is Number -> value.toLong()
    is String -> value.trim().toLongOrNull()
    else -> null
  }

  private fun asText(value: Any?): String = (value as? String)?.trim() ?: ""

  /**
   * The phone's own LAN address, used to hand the stream URL to a TV. Returns
   * null when only mobile data is up, in which case nothing is advertised.
   */
  private fun localIpv4(): String? {
    try {
      val interfaces = java.net.NetworkInterface.getNetworkInterfaces() ?: return null
      var fallback: String? = null
      for (nic in java.util.Collections.list(interfaces)) {
        if (!nic.isUp || nic.isLoopback) continue
        for (address in java.util.Collections.list(nic.inetAddresses)) {
          if (address is java.net.Inet4Address && !address.isLoopbackAddress) {
            val host = address.hostAddress ?: continue
            if (address.isSiteLocalAddress) return host
            if (fallback == null) fallback = host
          }
        }
      }
      return fallback
    } catch (_: Exception) {
      return null
    }
  }

  /**
   * One RTSP DESCRIBE on a plain socket.
   *
   * Why the app needs this: the shop DVR may refuse anonymous (guest) playback
   * with `401 Unauthorized`. Rather than letting VLC hit that 401 and raise its
   * own username/password dialog, the app asks first and only hands VLC a URL
   * that already answered. Nothing about the credentials is returned to JS.
   */
  private fun rtspProbe(url: String): Map<String, Any?> {
    val uri = Uri.parse(url)
    val host = uri.host ?: return mapOf("ok" to false, "status" to 0, "reason" to "bad-url")
    val port = if (uri.port > 0) uri.port else 554
    val socket = java.net.Socket()
    return try {
      socket.connect(java.net.InetSocketAddress(host, port), 4000)
      socket.soTimeout = 5000
      val request = "DESCRIBE $url RTSP/1.0\r\nCSeq: 1\r\n" +
        "User-Agent: HesabYar\r\nAccept: application/sdp\r\n\r\n"
      socket.getOutputStream().apply {
        write(request.toByteArray())
        flush()
      }
      val line = socket.getInputStream().bufferedReader().readLine() ?: ""
      val status = Regex("RTSP/1\\.0 (\\d{3})").find(line)?.groupValues?.get(1)?.toIntOrNull() ?: 0
      mapOf("ok" to (status in 200..299), "status" to status, "reason" to line.trim())
    } catch (error: Exception) {
      mapOf("ok" to false, "status" to 0, "reason" to (error.message ?: error.javaClass.simpleName))
    } finally {
      try { socket.close() } catch (_: Exception) { }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CctvPlayback")
    Events("onCctvEvent")

    AsyncFunction("playArchive") { options: Map<String, Any?>, promise: Promise ->
      cancelRequested = false

      val ip = asText(options["ip"])
      val port = asInt(options["port"], DEFAULT_PORT)
      val user = asText(options["user"]).ifEmpty { "admin" }
      val password = options["password"] as? String ?: ""
      val channel = asInt(options["channel"], 1).coerceIn(1, 4)
      val clipStart = asLong(options["startMs"])
      val clipEnd = asLong(options["endMs"])

      if (ip.isEmpty()) {
        promise.reject("E_CONFIG", "DVR address is empty", null)
        return@AsyncFunction
      }
      if (port !in 1..65535) {
        promise.reject("E_CONFIG", "DVR port is invalid", null)
        return@AsyncFunction
      }
      if (clipStart == null) {
        promise.reject("E_CONFIG", "Transaction time is invalid", null)
        return@AsyncFunction
      }

      val endMs = clipEnd ?: (clipStart + 10 * 60_000L)
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_CONTEXT", "App context is unavailable", null)
        return@AsyncFunction
      }

      Thread {
        var partial: File? = null
        var queryClient: DvripClient? = null
        try {
          val client = DvripClient(ip, port, user, password)
          queryClient = client
          activeClient = client

          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "connecting"))
          client.connect()

          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "login"))
          client.login()

          /**
           * The device timestamps are its own wall clock. A shop DVR may sit a
           * few minutes away from the phone, so the first query uses a widened
           * window before giving up.
           */
          val beginStamp = DvripClient.stamp(Date(clipStart - WIDEN_MINUTES * 60_000L))
          val endStamp = DvripClient.stamp(Date(endMs + WIDEN_MINUTES * 60_000L))
          val moment = DvripClient.stamp(Date(clipStart))

          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "query"))
          val files = client.queryFiles(beginStamp, endStamp, channel - 1)
          if (files.isEmpty()) {
            throw DvripException("no recording found for this time")
          }

          // Everything that intersects the requested window, in playing order.
          // Falling back to the single nearest file keeps odd firmware usable.
          var segments = client.segmentsFor(files, clipStart, endMs)
          if (segments.isEmpty()) {
            val chosen = client.pickFile(files, moment)
              ?: throw DvripException("no recording found for this time")
            segments = listOf(chosen)
          }

          // The query socket is done: a stream that is stopped early leaves
          // unread packets on the wire, so every segment gets a clean one.
          try { client.logout() } catch (_: Exception) { }
          try { client.close() } catch (_: Exception) { }
          if (activeClient === client) activeClient = null
          queryClient = null

          val directory = File(context.cacheDir, "cctv")
          if (!directory.exists()) directory.mkdirs()
          pruneClips(directory)
          val target = File(directory, "clip-" + System.currentTimeMillis() + ".h264")
          partial = target

          val totalFrames = DvripClient.framesFor(endMs - clipStart)
          var written = 0L
          var counted = 0L
          var downloaded = 0

          for ((index, segment) in segments.withIndex()) {
            if (cancelRequested) throw DvripException("cancelled")
            if (counted >= totalFrames || written >= MAX_CLIP_BYTES) break

            val fileBegin = DvripClient.parseStamp(segment.begin) ?: clipStart
            val fileEnd = DvripClient.parseStamp(segment.end) ?: endMs
            val segStart = Math.max(clipStart, fileBegin)
            val segEnd = Math.min(endMs, Math.max(fileEnd, segStart + 1000L))
            val budget = Math.min(
              totalFrames - counted,
              DvripClient.framesFor(segEnd - segStart)
            )

            sendEvent(
              "onCctvEvent",
              mapOf(
                "type" to "stage",
                "stage" to "download",
                "file" to segment.fileName,
                "bytes" to segment.size,
                "segment" to (index + 1),
                "segments" to segments.size
              )
            )

            val session = DvripClient(ip, port, user, password)
            activeClient = session
            try {
              session.connect()
              session.login()
              written += session.downloadRange(
                segment,
                target,
                segStart,
                budget,
                MAX_CLIP_BYTES - written
              ) { bytes ->
                val total = written + bytes
                sendEvent(
                  "onCctvEvent",
                  mapOf(
                    "type" to "progress",
                    "bytes" to total,
                    "total" to 0,
                    "file" to segment.fileName,
                    "frames" to counted + session.frames,
                    "framesTotal" to totalFrames
                  )
                )
              }
              counted += session.frames
              downloaded += 1
            } finally {
              if (activeClient === session) activeClient = null
              if (!cancelRequested) {
                try { session.logout() } catch (_: Exception) { }
              }
              try { session.close() } catch (_: Exception) { }
            }
          }

          if (written <= 0L || downloaded == 0) {
            target.delete()
            throw DvripException("the device returned an empty recording")
          }

          sendEvent(
            "onCctvEvent",
            mapOf("type" to "stage", "stage" to "downloaded", "bytes" to written)
          )

          // VLC for Android will not open a containerless `.h264` file, so the
          // download is wrapped in MPEG-TS first; the player then gets a normal
          // recording it can also seek in.
          val playable = try {
            muxToTs(target)
          } catch (_: Exception) {
            null
          }

          // JS publishes the clip through the FileProvider and opens VLC. VLC
          // is the player — this module only fetches the recording.
          promise.resolve(
            mapOf(
              "ok" to true,
              "path" to (playable?.absolutePath ?: target.absolutePath),
              "mime" to if (playable == null) "video/avc" else "video/mp2t",
              "file" to segments.first().fileName,
              "bytes" to written,
              "begin" to segments.first().begin,
              "end" to segments[downloaded - 1].end,
              "segments" to downloaded,
              "frames" to counted,
              "framesTotal" to totalFrames,
              "fps" to DvripClient.DEFAULT_FPS,
              "startMs" to clipStart,
              "endMs" to endMs
            )
          )
        } catch (error: Exception) {
          if (cancelRequested) {
            try { partial?.delete() } catch (_: Exception) { }
          }
          val message = if (cancelRequested) "cancelled" else (error.message ?: "archive download failed")
          sendEvent(
            "onCctvEvent",
            mapOf("type" to "error", "message" to message, "cancelled" to cancelRequested)
          )
          promise.reject(
            if (cancelRequested) "E_CANCELLED" else "E_DVRIP",
            message,
            null
          )
        } finally {
          val leftover = queryClient
          activeClient = null
          if (leftover != null) {
            if (!cancelRequested) {
              try { leftover.logout() } catch (_: Exception) { }
            }
            try { leftover.close() } catch (_: Exception) { }
          }
        }
      }.start()
    }

    /**
     * Streams one archived window to the player while it is still downloading.
     *
     * This exists because a ten-minute window on this recorder is 40+ MB: the
     * file-based path keeps the owner staring at a progress counter for a
     * couple of minutes, while XMEye shows the archive almost immediately. The
     * DVR answers `OPPlayBack` as one continuous Annex-B stream, so there is no
     * technical reason to wait — the bytes go into a loopback HTTP server the
     * moment they arrive and VLC starts on the first frames.
     *
     * Resolves with `{ok, url, ...}` as soon as the recording window is found,
     * *before* the download starts, so JS can hand the URL to the player
     * immediately. Any later failure arrives as an `error` event.
     */
    AsyncFunction("streamArchive") { options: Map<String, Any?>, promise: Promise ->
      cancelRequested = false

      val ip = asText(options["ip"])
      val port = asInt(options["port"], DEFAULT_PORT)
      val user = asText(options["user"]).ifEmpty { "admin" }
      val password = options["password"] as? String ?: ""
      val channel = asInt(options["channel"], 1).coerceIn(1, 4)
      val streamType = asInt(options["streamType"], 0).coerceIn(0, 1)
      val clipStart = asLong(options["startMs"])
      val clipEnd = asLong(options["endMs"])

      if (ip.isEmpty()) {
        promise.reject("E_CONFIG", "DVR address is empty", null)
        return@AsyncFunction
      }
      if (port !in 1..65535) {
        promise.reject("E_CONFIG", "DVR port is invalid", null)
        return@AsyncFunction
      }
      if (clipStart == null) {
        promise.reject("E_CONFIG", "Transaction time is invalid", null)
        return@AsyncFunction
      }

      val endMs = clipEnd ?: (clipStart + 10 * 60_000L)
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_CONTEXT", "App context is unavailable", null)
        return@AsyncFunction
      }

      val exposeLan = options["exposeLan"] != false

      Thread {
        val server = ArchiveStreamServer(exposeLan)
        activeStream = server
        var settled = false
        var queryClient: DvripClient? = null
        try {
          server.start()

          val client = DvripClient(ip, port, user, password, 8000, streamType)
          queryClient = client
          activeClient = client

          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "connecting"))
          client.connect()
          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "login"))
          client.login()

          val beginStamp = DvripClient.stamp(Date(clipStart - WIDEN_MINUTES * 60_000L))
          val endStamp = DvripClient.stamp(Date(endMs + WIDEN_MINUTES * 60_000L))
          val moment = DvripClient.stamp(Date(clipStart))

          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "query"))
          val files = client.queryFiles(beginStamp, endStamp, channel - 1)
          if (files.isEmpty()) throw DvripException("no recording found for this time")

          var segments = client.segmentsFor(files, clipStart, endMs)
          if (segments.isEmpty()) {
            val chosen = client.pickFile(files, moment)
              ?: throw DvripException("no recording found for this time")
            segments = listOf(chosen)
          }

          try { client.logout() } catch (_: Exception) { }
          try { client.close() } catch (_: Exception) { }
          if (activeClient === client) activeClient = null
          queryClient = null

          // The player can start right now: the URL is live and bytes follow.
          settled = true
          promise.resolve(
            mapOf(
              "ok" to true,
              "streaming" to true,
              "url" to server.url,
              "lanUrl" to server.lanUrl(localIpv4()),
              "mime" to "video/mp2t",
              "port" to server.port,
              "file" to segments.first().fileName,
              "begin" to segments.first().begin,
              "end" to segments.last().end,
              "segments" to segments.size,
              "streamType" to streamType,
              "startMs" to clipStart,
              "endMs" to endMs
            )
          )
          settled = true

          val totalFrames = DvripClient.framesFor(endMs - clipStart)
          var written = 0L
          var counted = 0L

          for ((index, segment) in segments.withIndex()) {
            if (cancelRequested) throw DvripException("cancelled")
            if (counted >= totalFrames || written >= MAX_CLIP_BYTES) break

            val fileBegin = DvripClient.parseStamp(segment.begin) ?: clipStart
            val fileEnd = DvripClient.parseStamp(segment.end) ?: endMs
            val segStart = Math.max(clipStart, fileBegin)
            val segEnd = Math.min(endMs, Math.max(fileEnd, segStart + 1000L))
            val budget = Math.min(
              totalFrames - counted,
              DvripClient.framesFor(segEnd - segStart)
            )

            sendEvent(
              "onCctvEvent",
              mapOf(
                "type" to "stage",
                "stage" to "streaming",
                "file" to segment.fileName,
                "bytes" to segment.size,
                "segment" to (index + 1),
                "segments" to segments.size
              )
            )

            val session = DvripClient(ip, port, user, password, 8000, streamType)
            activeClient = session
            try {
              session.connect()
              session.login()
              written += session.streamRange(
                segment,
                segStart,
                budget,
                MAX_CLIP_BYTES - written,
                { bytes ->
                  sendEvent(
                    "onCctvEvent",
                    mapOf(
                      "type" to "progress",
                      "bytes" to (written + bytes),
                      "total" to 0,
                      "file" to segment.fileName,
                      "frames" to (counted + session.frames),
                      "framesTotal" to totalFrames,
                      "streaming" to true
                    )
                  )
                }
              ) { chunk ->
                if (!server.push(chunk)) throw DvripException("cancelled")
              }
              counted += session.frames
            } finally {
              if (activeClient === session) activeClient = null
              if (!cancelRequested) {
                try { session.logout() } catch (_: Exception) { }
              }
              try { session.close() } catch (_: Exception) { }
            }
          }

          server.finish()
          sendEvent(
            "onCctvEvent",
            mapOf("type" to "stage", "stage" to "streamed", "bytes" to written)
          )
        } catch (error: Exception) {
          server.close()
          val cancelled = cancelRequested
          val message = if (cancelled) "cancelled" else (error.message ?: "archive stream failed")
          sendEvent(
            "onCctvEvent",
            mapOf("type" to "error", "message" to message, "cancelled" to cancelled)
          )
          // Before the URL was handed over there is nobody listening yet, so the
          // caller still needs the rejection; afterwards the event is enough.
          if (!settled) {
            promise.reject(if (cancelled) "E_CANCELLED" else "E_DVRIP", message, null)
          }
        } finally {
          if (activeStream === server) {
            // On a clean finish the serving thread closes itself after the last
            // chunk; only an aborted run needs closing here.
            if (cancelRequested || !settled) server.close()
            activeStream = null
          }
          activeClient = null
          val leftover = queryClient
          if (leftover != null) {
            if (!cancelRequested) {
              try { leftover.logout() } catch (_: Exception) { }
            }
            try { leftover.close() } catch (_: Exception) { }
          }
        }
      }.start()
    }

    /**
     * Read-only account probe: can this recorder be used without a password?
     *
     * Guest/anonymous playback cannot be switched on from a client — the DVRIP
     * protocol has no account-write call — so the app tests what the device
     * actually allows and reports it honestly instead of guessing. Nothing is
     * changed on the recorder.
     */
    AsyncFunction("probeGuest") { options: Map<String, Any?>, promise: Promise ->
      val ip = asText(options["ip"])
      val port = asInt(options["port"], DEFAULT_PORT)
      val channel = asInt(options["channel"], 1).coerceIn(1, 4)
      val startMs = asLong(options["startMs"]) ?: System.currentTimeMillis()
      val ownerUser = asText(options["user"]).ifEmpty { "admin" }
      val ownerPassword = options["password"] as? String ?: ""

      if (ip.isEmpty()) {
        promise.reject("E_CONFIG", "DVR address is empty", null)
        return@AsyncFunction
      }

      Thread {
        val attempts = ArrayList<Map<String, Any?>>()
        val candidates = listOf("guest" to "", "guest" to "guest", "anonymous" to "", "admin" to "")
        var anyWorks = false
        for ((name, secret) in candidates) {
          val client = DvripClient(ip, port, name, secret)
          var answer = "unreachable"
          var files = 0
          var ret = -1
          try {
            client.connect()
            client.login()
            ret = 100
            val begin = DvripClient.stamp(Date(startMs - WIDEN_MINUTES * 60_000L))
            val end = DvripClient.stamp(Date(startMs + WIDEN_MINUTES * 60_000L))
            val found = client.queryFiles(begin, end, channel - 1)
            files = found.size
            answer = if (files > 0) "playback-ok" else "login-ok-no-files"
            if (files > 0) anyWorks = true
          } catch (error: Exception) {
            answer = error.message ?: "failed"
          } finally {
            try { client.logout() } catch (_: Exception) { }
            try { client.close() } catch (_: Exception) { }
          }
          attempts.add(
            mapOf(
              "user" to name,
              "secret" to (if (secret.isEmpty()) "none" else "known-default"),
              "ret" to ret,
              "files" to files,
              "result" to answer
            )
          )
        }

        // Device configuration that decides guest access lives on the recorder;
        // read the user/config blocks so the owner sees what the box reports.
        val configs = LinkedHashMap<String, Any?>()
        val probeClient = DvripClient(ip, port, ownerUser, ownerPassword)
        try {
          probeClient.connect()
          probeClient.login()
          for (name in listOf("Users", "General", "NetWork")) {
            try {
              val reply = probeClient.readConfig(name)
              configs[name] = reply.toString().take(4000)
            } catch (error: Exception) {
              configs[name] = "error: " + (error.message ?: "failed")
            }
          }
        } catch (error: Exception) {
          configs["error"] = error.message ?: "config read failed"
        } finally {
          try { probeClient.logout() } catch (_: Exception) { }
          try { probeClient.close() } catch (_: Exception) { }
        }

        promise.resolve(
          mapOf(
            "ok" to anyWorks,
            "guestUsable" to anyWorks,
            "attempts" to attempts,
            "configs" to configs
          )
        )
      }.start()
    }

    AsyncFunction("probeRtsp") { urlText: String, promise: Promise ->
      val url = urlText.trim()
      if (url.isEmpty()) {
        promise.resolve(mapOf("ok" to false, "status" to 0, "reason" to "empty-url"))
        return@AsyncFunction
      }
      promise.resolve(rtspProbe(url))
      return@AsyncFunction
    }

    AsyncFunction("stop") {
      cancelRequested = true
      val client = activeClient
      try { client?.cancelled = true } catch (_: Exception) { }
      // A blocked DVRIP read only unblocks when the socket goes away.
      try { client?.close() } catch (_: Exception) { }
      // The player side too, otherwise a paused VLC keeps the loopback socket.
      val stream = activeStream
      try { stream?.close() } catch (_: Exception) { }
      activeStream = null
      true
    }

    /**
     * Hands a stream or a local clip to VLC.
     *
     * `content://` URIs need FLAG_GRANT_READ_URI_PERMISSION — React Native's
     * Linking does not add it, which is why VLC cannot open app-private files
     * without this method.
     */
    AsyncFunction("openInVlc") { uriText: String, mime: String?, promise: Promise ->
      try {
        val context = appContext.reactContext
          ?: throw IllegalStateException("No Android context")
        val uri = Uri.parse(uriText)
        val type = mime?.takeIf { it.isNotBlank() } ?: "video/*"
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK

        val direct = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, type)
          addFlags(flags)
          setPackage(VLC_PACKAGE)
        }

        try {
          context.startActivity(direct)
          promise.resolve(true)
          return@AsyncFunction
        } catch (_: ActivityNotFoundException) {
          // VLC is not the registered handler — any other player may still work.
        }

        val anyPlayer = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, type)
          addFlags(flags)
        }
        context.startActivity(anyPlayer)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject(
          "E_VLC_OPEN",
          error.message ?: "could not open the video player",
          null
        )
      }
    }
  }
}
