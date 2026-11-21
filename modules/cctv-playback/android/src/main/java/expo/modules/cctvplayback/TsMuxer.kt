package expo.modules.cctvplayback

import java.io.ByteArrayOutputStream

/**
 * Wraps the DVR's raw Annex-B H.264 elementary stream into MPEG-TS on the fly.
 *
 * Why this exists: VLC for Android will not open a containerless `.h264` file or
 * stream — the owner tested it and got audio-less nothing, and the same failure
 * hits the downloaded clip. An MP4 is not an option either: its index (moov)
 * has to be written after the last frame, so it cannot be played while it is
 * still being produced. MPEG-TS is the one standard container built for live
 * delivery: PAT/PMT up front, timestamps per access unit, no trailing index, and
 * every Android player (VLC, MX, MediaPlayer) reads it from a socket.
 *
 * The muxer is deliberately small and dependency-free:
 *  - NAL units are re-assembled across arbitrary chunk boundaries (a DVRIP
 *    packet does not respect NAL edges);
 *  - access-unit boundaries come from AUD NALs or from `first_mb_in_slice == 0`
 *    in a slice header, so each picture gets its own PES packet and PTS;
 *  - PAT/PMT are repeated about once per second, which is what a player needs
 *    when it joins a stream already in progress.
 *
 * @param fps assumed picture rate; it only defines the timestamp spacing, the
 *            player uses the container timestamps and reports this rate.
 */
class TsMuxer(private val fps: Int = 25) {
  companion object {
    private const val PACKET = 188
    private const val VIDEO_PID = 0x0100
    private const val PMT_PID = 0x1000
    private const val STREAM_ID = 0xE0
    private const val PSI_INTERVAL_FRAMES = 25L
    private const val MAX_AU_BYTES = 2 * 1024 * 1024
  }

  /** Bytes that do not yet form a complete NAL unit. */
  private val carry = ByteArrayOutputStream()

  /** Non-VCL NALs (SPS/PPS/SEI) waiting for the picture they belong to. */
  private val prefix = ArrayList<ByteArray>(3)

  private val accessUnit = ByteArrayOutputStream(64 * 1024)

  private var frameIndex = 0L
  private val step = (90_000L / fps.coerceAtLeast(1)).coerceAtLeast(1L)

  private var ccVideo = 0
  private var ccPat = 0
  private var ccPmt = 0

  /** Frames muxed so far — the module reports this to the UI. */
  val frames: Long get() = frameIndex

  /** Feeds one raw DVRIP packet; returns the TS bytes ready to send. */
  fun push(chunk: ByteArray): ByteArray {
    val out = ByteArrayOutputStream(chunk.size + 4096)
    if (chunk.isEmpty()) return out.toByteArray()
    carry.write(chunk)
    val data = carry.toByteArray()
    carry.reset()

    val starts = ArrayList<Int>(8)
    var index = 0
    while (true) {
      val found = findStartCode(data, index)
      if (found < 0) break
      starts.add(found)
      index = found + 3
    }

    if (starts.isEmpty()) {
      // Keep only what could be the beginning of a start code.
      val keepFrom = Math.max(0, data.size - 3)
      carry.write(data, keepFrom, data.size - keepFrom)
      return out.toByteArray()
    }

    for (slot in 0 until starts.size - 1) {
      val from = starts[slot] + 3
      var to = starts[slot + 1]
      // A 4-byte start code leaves 0x00 padding on the previous NAL. Only a few
      // bytes may be trimmed: a NAL payload is allowed to END in zero bytes (a
      // 200 KB IDR of zeros is what made an earlier version cut frames to 3 bytes).
      var trimmed = 0
      while (to > from && trimmed < 3 && data[to - 1].toInt() == 0) {
        to -= 1
        trimmed += 1
      }
      if (to > from) handleNal(data, from, to, out)
    }

    // The final NAL is still open: keep it (with its start code) for next time.
    val lastStart = starts[starts.size - 1]
    carry.write(data, lastStart, data.size - lastStart)
    return out.toByteArray()
  }

  /** Flushes the access unit still in progress — call once when the DVR ends. */
  fun finish(): ByteArray {
    val out = ByteArrayOutputStream(4096)
    if (carry.size() > 3) {
      // Trailing NAL with no terminator: emit it as-is.
      val tail = carry.toByteArray()
      carry.reset()
      val from = if (startsWithCode(tail)) 3 else 0
      if (tail.size - from > 0) handleNal(tail, from, tail.size, out)
    }
    flushAccessUnit(out)
    return out.toByteArray()
  }

  // ------------------------------------------------------------------ NAL

  private fun handleNal(data: ByteArray, from: Int, to: Int, out: ByteArrayOutputStream) {
    val type = data[from].toInt() and 0x1f
    when (type) {
      9 -> { // access unit delimiter: a picture starts here
        flushAccessUnit(out)
        beginAccessUnit()
        append(data, from, to)
      }
      1, 5 -> { // coded slice: only first_mb_in_slice == 0 opens a picture
        if (firstMbInSlice(data, from + 1, to) == 0) {
          flushAccessUnit(out)
          beginAccessUnit()
        }
        append(data, from, to)
      }
      6, 7, 8 -> { // SEI / SPS / PPS
        if (accessUnit.size() == 0) prefix.add(data.copyOfRange(from, to))
        else append(data, from, to)
      }
      else -> {
        if (accessUnit.size() == 0) prefix.add(data.copyOfRange(from, to))
        else append(data, from, to)
      }
    }
    if (accessUnit.size() > MAX_AU_BYTES) flushAccessUnit(out)
  }

  private fun beginAccessUnit() {
    for (block in prefix) writeNal(block)
    prefix.clear()
  }

  private fun append(data: ByteArray, from: Int, to: Int) {
    writeStartCode()
    accessUnit.write(data, from, to - from)
  }

  private fun writeNal(block: ByteArray) {
    writeStartCode()
    accessUnit.write(block, 0, block.size)
  }

  private fun writeStartCode() {
    accessUnit.write(0x00)
    accessUnit.write(0x00)
    accessUnit.write(0x00)
    accessUnit.write(0x01)
  }

  private fun flushAccessUnit(out: ByteArrayOutputStream) {
    if (accessUnit.size() == 0) return
    val picture = accessUnit.toByteArray()
    accessUnit.reset()

    val pts = (frameIndex * step) and 0x1FFFFFFFFL
    frameIndex += 1
    if ((frameIndex - 1) % PSI_INTERVAL_FRAMES == 0L) emitPsi(out)
    emitPes(picture, pts, out)
  }

  // -------------------------------------------------------------- muxing

  private fun emitPes(picture: ByteArray, pts: Long, out: ByteArrayOutputStream) {
    // 00 00 01 | stream_id | length(2) | '10'+flags(1) | flags(1) | hdr_len | PTS(5)
    val pes = ByteArray(14 + picture.size)
    pes[0] = 0x00
    pes[1] = 0x00
    pes[2] = 0x01
    pes[3] = STREAM_ID.toByte()
    // A video PES may declare an unbounded length; this keeps big IDR frames
    // legal without splitting them into several PES packets.
    pes[4] = 0x00
    pes[5] = 0x00
    pes[6] = 0x80.toByte()
    pes[7] = 0x80.toByte()
    pes[8] = 0x05
    writePts(pes, 9, pts)
    System.arraycopy(picture, 0, pes, 14, picture.size)

    var offset = 0
    var first = true
    while (offset < pes.size) {
      val packet = ByteArray(PACKET) { 0xFF.toByte() }
      packet[0] = 0x47
      packet[1] = (((if (first) 0x40 else 0x00) or ((VIDEO_PID shr 8) and 0x1f))).toByte()
      packet[2] = (VIDEO_PID and 0xff).toByte()
      val cc = ccVideo
      ccVideo = (ccVideo + 1) and 0x0f

      var payloadStart: Int
      if (first) {
        val room = PACKET - 12 // 4 header + 1 length + 7 adaptation
        val take = Math.min(room, pes.size - offset)
        val stuffing = room - take
        val adaptLen = 7 + stuffing
        packet[3] = (0x30 or cc).toByte()
        packet[4] = adaptLen.toByte()
        packet[5] = 0x10 // PCR flag, no other optional fields
        writePcr(packet, 6, pts)
        if (stuffing > 0) {
          for (i in 0 until stuffing) packet[12 + i] = 0xFF.toByte()
        }
        payloadStart = 12 + stuffing
        System.arraycopy(pes, offset, packet, payloadStart, take)
        offset += take
      } else {
        val take = Math.min(184, pes.size - offset)
        if (take == 184) {
          packet[3] = (0x10 or cc).toByte()
          payloadStart = 4
        } else {
          val adaptLen = 183 - take
          packet[3] = (0x30 or cc).toByte()
          packet[4] = adaptLen.toByte()
          if (adaptLen > 0) packet[5] = 0x00
          payloadStart = 5 + adaptLen
        }
        System.arraycopy(pes, offset, packet, payloadStart, take)
        offset += take
      }
      out.write(packet)
      first = false
    }
  }

  private fun emitPsi(out: ByteArrayOutputStream) {
    tsSection(out, 0x0000, buildPat(), ccPat)
    ccPat = (ccPat + 1) and 0x0f
    tsSection(out, PMT_PID, buildPmt(), ccPmt)
    ccPmt = (ccPmt + 1) and 0x0f
  }

  private fun tsSection(out: ByteArrayOutputStream, pid: Int, section: ByteArray, cc: Int) {
    val packet = ByteArray(PACKET) { 0xFF.toByte() }
    packet[0] = 0x47
    packet[1] = ((0x40 or ((pid shr 8) and 0x1f))).toByte()
    packet[2] = (pid and 0xff).toByte()
    packet[3] = (0x10 or (cc and 0x0f)).toByte()
    packet[4] = 0x00 // pointer_field
    System.arraycopy(section, 0, packet, 5, section.size)
    // PSI packets are allowed to end in 0xFF stuffing, which the array already holds.
    out.write(packet)
  }

  private fun buildPat(): ByteArray {
    // table_id | section_length | tsid | version | section | last | program | PMT pid | CRC
    val body = ByteArray(16)
    body[0] = 0x00 // table_id: program association
    body[1] = 0xB0.toByte() // section_syntax_indicator + reserved, high nibble of the length
    body[2] = 0x0D // section_length = 13
    body[3] = 0x00 // transport_stream_id
    body[4] = 0x01
    body[5] = 0xC1.toByte() // reserved + version 0 + current_next 1
    body[6] = 0x00 // section_number
    body[7] = 0x00 // last_section_number
    body[8] = 0x00 // program_number 1
    body[9] = 0x01
    body[10] = ((0xE0 or ((PMT_PID shr 8) and 0x1f))).toByte()
    body[11] = (PMT_PID and 0xff).toByte()
    writeCrc(body, 12)
    return body
  }

  private fun buildPmt(): ByteArray {
    // table_id | length | program | version | section | last | PCR pid | pinfo |
    // stream_type | elementary pid | es_info | CRC
    val body = ByteArray(21)
    body[0] = 0x02 // table_id: program map
    body[1] = 0xB0.toByte()
    body[2] = 0x12 // section_length = 18
    body[3] = 0x00 // program_number 1
    body[4] = 0x01
    body[5] = 0xC1.toByte()
    body[6] = 0x00
    body[7] = 0x00
    body[8] = ((0xE0 or ((VIDEO_PID shr 8) and 0x1f))).toByte() // PCR_PID
    body[9] = (VIDEO_PID and 0xff).toByte()
    body[10] = 0xF0.toByte() // program_info_length = 0
    body[11] = 0x00
    body[12] = 0x1B // stream_type: H.264
    body[13] = ((0xE0 or ((VIDEO_PID shr 8) and 0x1f))).toByte()
    body[14] = (VIDEO_PID and 0xff).toByte()
    body[15] = 0xF0.toByte() // ES_info_length = 0
    body[16] = 0x00
    writeCrc(body, 17)
    return body
  }

  /**
   * MPEG-2 CRC-32: polynomial 0x04C11DB7, initial value 0xFFFFFFFF, no input or
   * output reflection, no final xor. This is the checksum PAT/PMT carry.
   */
  private fun crc32(data: ByteArray, from: Int, to: Int): Int {
    var crc = -1
    for (i in from until to) {
      crc = crc xor ((data[i].toInt() and 0xff) shl 24)
      for (bit in 0 until 8) {
        crc = if (crc < 0) (crc shl 1) xor 0x04C11DB7 else crc shl 1
      }
    }
    return crc
  }

  private fun writeCrc(body: ByteArray, crcIndex: Int) {
    val crc = crc32(body, 0, crcIndex)
    body[crcIndex] = ((crc shr 24) and 0xff).toByte()
    body[crcIndex + 1] = ((crc shr 16) and 0xff).toByte()
    body[crcIndex + 2] = ((crc shr 8) and 0xff).toByte()
    body[crcIndex + 3] = (crc and 0xff).toByte()
  }

  private fun writePcr(packet: ByteArray, at: Int, pts: Long) {
    val base = Math.max(0L, pts - 3600L) // 40 ms before the picture, in 90 kHz ticks
    packet[at] = ((base shr 25) and 0xff).toByte()
    packet[at + 1] = ((base shr 17) and 0xff).toByte()
    packet[at + 2] = ((base shr 9) and 0xff).toByte()
    packet[at + 3] = ((base shr 1) and 0xff).toByte()
    packet[at + 4] = ((((base and 0x01) shl 7) or 0x7E)).toByte()
    packet[at + 5] = 0x00
  }

  private fun writePts(pes: ByteArray, at: Int, pts: Long) {
    pes[at] = (((0x02 shl 4) or (((pts shr 30) and 0x07) shl 1).toInt()) or 0x01).toByte()
    pes[at + 1] = ((pts shr 22) and 0xff).toByte()
    pes[at + 2] = (((((pts shr 15) and 0x7f) shl 1) or 0x01)).toByte()
    pes[at + 3] = ((pts shr 7) and 0xff).toByte()
    pes[at + 4] = ((((pts and 0x7f) shl 1) or 0x01)).toByte()
  }

  // ------------------------------------------------------------- scanning

  private fun findStartCode(data: ByteArray, from: Int): Int {
    var i = from
    while (i + 2 < data.size) {
      if (data[i].toInt() == 0 && data[i + 1].toInt() == 0 && data[i + 2].toInt() == 1) return i
      i += 1
    }
    return -1
  }

  private fun startsWithCode(data: ByteArray): Boolean =
    data.size >= 3 && data[0].toInt() == 0 && data[1].toInt() == 0 && data[2].toInt() == 1

  /**
   * Reads `first_mb_in_slice` (the first unsigned Exp-Golomb value of a slice
   * header). Zero means a new picture starts at this slice.
   */
  private fun firstMbInSlice(data: ByteArray, from: Int, to: Int): Int {
    if (from >= to) return 0
    var bitPos = 0
    var zeros = 0
    fun nextBit(): Int {
      val byteIndex = from + (bitPos shr 3)
      if (byteIndex >= to) return 0
      val value = (data[byteIndex].toInt() shr (7 - (bitPos and 7))) and 1
      bitPos += 1
      return value
    }
    while (nextBit() == 0) {
      zeros += 1
      if (zeros > 16) return -1
    }
    var value = 0
    for (i in 0 until zeros) value = (value shl 1) or nextBit()
    return ((1 shl zeros) - 1) + value
  }
}
