package expo.modules.cctvplayback

import java.io.BufferedOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Serves one archived recording to the player while it is still being fetched.
 *
 * Why a local server instead of a growing file: the DVR answers `OPPlayBack`
 * as a continuous Annex-B elementary stream, so the bytes can be forwarded the
 * moment they arrive. VLC then starts on the first frames instead of waiting
 * for the whole window (the shop owner measured 40+ MB for ten minutes, i.e.
 * minutes of silence before the first picture).
 *
 * Design notes that matter:
 *  - one client, random port, no credentials in the URL, so the player cannot
 *    raise an authentication dialog. Loopback by default; when `exposeLan` is on
 *    it binds every interface for the TV and the path carries a per-stream nonce;
 *  - the DVR sends raw Annex-B H.264, which VLC for Android refuses; every chunk
 *    is therefore wrapped in MPEG-TS on the way out (`TsMuxer`) and served as
 *    `/archive.ts`, a container every Android player reads from a socket;
 *  - a bounded queue gives real backpressure: if the player is slower than the
 *    DVR, the download stalls instead of growing memory without limit;
 *  - every chunk is flushed immediately, otherwise the player sits on a buffer
 *    that would only fill when the download ends — exactly the behaviour we are
 *    trying to remove.
 */
class ArchiveStreamServer(
  /** True when the phone's own network interfaces may reach the stream (TV). */
  val exposeLan: Boolean = false
) {
  companion object {
    private val END_OF_STREAM = ByteArray(0)
    private const val QUEUE_CHUNKS = 64
  }

  private val muxer = TsMuxer()

  /**
   * Per-stream nonce. The stream is opened on the LAN for the TV, so the URL
   * carries a one-shot key: knowing the port alone is not enough to pull the
   * shop's footage off the network.
   */
  private val token = (1..4).joinToString("") {
    String.format(java.util.Locale.US, "%02x", (Math.random() * 256).toInt())
  }

  /** Token in the PATH (not a query): players detect the demuxer from `.ts`. */
  private val path: String get() = "archive-$token.ts"

  private val queue = LinkedBlockingQueue<ByteArray>(QUEUE_CHUNKS)
  private val closed = AtomicBoolean(false)

  @Volatile
  private var server: ServerSocket? = null

  @Volatile
  private var client: Socket? = null

  val port: Int get() = server?.localPort ?: 0

  /** Frames muxed so far (a frame = one access unit = one picture). */
  val frames: Long get() = muxer.frames

  val url: String get() = "http://127.0.0.1:$port/$path"

  /** Same stream reachable from the LAN, for a TV/other player. Empty when off. */
  fun lanUrl(host: String?): String =
    if (exposeLan && !host.isNullOrEmpty()) "http://$host:$port/$path" else ""

  fun start() {
    if (server != null) return
    val bind = if (exposeLan) null else InetAddress.getByName("127.0.0.1")
    val socket = ServerSocket(0, 1, bind)
    // Bounded wait: a player that never connects must not leak a thread forever.
    socket.soTimeout = 5000
    server = socket
    Thread({
      try {
        var peer: Socket? = null
        var waited = 0
        while (peer == null && !closed.get() && waited < 60) {
          try {
            peer = socket.accept()
          } catch (_: java.net.SocketTimeoutException) {
            waited += 1
          }
        }
        val accepted = peer ?: return@Thread
        client = accepted
        try { accepted.tcpNoDelay = true } catch (_: Exception) { }
        if (!readRequestHeaders(accepted, token)) {
          try {
            accepted.getOutputStream().write(
              "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                .toByteArray(Charsets.US_ASCII)
            )
          } catch (_: Exception) { }
          return@Thread
        }
        val output = BufferedOutputStream(accepted.getOutputStream(), 64 * 1024)
        val header = "HTTP/1.1 200 OK\r\n" +
          "Content-Type: video/mp2t\r\n" +
          "Connection: close\r\n" +
          "Cache-Control: no-store\r\n" +
          "Accept-Ranges: none\r\n\r\n"
        output.write(header.toByteArray(Charsets.US_ASCII))
        output.flush()
        while (!closed.get()) {
          val chunk = queue.poll(200, TimeUnit.MILLISECONDS) ?: continue
          if (chunk === END_OF_STREAM) break
          output.write(chunk)
          // Flush per DVRIP packet: the player must see frames as they land.
          output.flush()
        }
      } catch (_: Exception) {
        // A player that walks away is a normal end for this stream.
      } finally {
        closeQuietly()
      }
    }, "cctv-archive-stream").start()
  }

  /**
   * Consumes the request line + headers so the response is not written early.
   *
   * @return true when the request carries this stream's nonce.
   */
  private fun readRequestHeaders(socket: Socket, expectedToken: String): Boolean {
    try {
      val input = socket.getInputStream()
      val builder = StringBuilder()
      var previous = -1
      while (builder.length < 4096) {
        val next = input.read()
        if (next < 0) break
        builder.append(next.toChar())
        if (previous == '\n'.code && next == '\n'.code) break
        previous = next
      }
      val request = builder.toString()
      return request.contains("/archive-$expectedToken.ts")
    } catch (_: Exception) {
      // A timeout here means no player: nothing to serve.
      return false
    }
  }

  /**
   * Hands one DVRIP packet to the player. Blocks while the player is behind,
   * which is the whole point of the bounded queue.
   *
   * @return false when the stream was closed (player gone or cancel pressed).
   */
  fun push(bytes: ByteArray): Boolean {
    if (bytes.isEmpty()) return !closed.get()
    val packet = try {
      muxer.push(bytes)
    } catch (_: Exception) {
      return !closed.get()
    }
    return enqueue(packet)
  }

  private fun enqueue(bytes: ByteArray): Boolean {
    if (bytes.isEmpty()) return !closed.get()
    while (!closed.get()) {
      if (queue.offer(bytes, 200, TimeUnit.MILLISECONDS)) return true
    }
    return false
  }

  /** The recording ended normally; the player closes after the last frame. */
  fun finish() {
    try { enqueue(muxer.finish()) } catch (_: Exception) { }
    try { queue.offer(END_OF_STREAM, 2, TimeUnit.SECONDS) } catch (_: Exception) { }
  }

  fun close() {
    if (closed.getAndSet(true)) return
    queue.clear()
    closeQuietly()
  }

  private fun closeQuietly() {
    try { client?.close() } catch (_: Exception) { }
    client = null
    try { server?.close() } catch (_: Exception) { }
    server = null
  }
}
