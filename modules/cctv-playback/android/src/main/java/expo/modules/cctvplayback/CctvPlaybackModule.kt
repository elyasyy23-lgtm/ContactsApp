package expo.modules.cctvplayback

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Date

/**
 * Sends ONE command to the shop DVR: "show the recording of this moment on the
 * monitor that is plugged into the recorder".
 *
 * The Xiongmai/XMEye firmware has no network verb that starts playback on its
 * own HDMI/VGA output — OPPlayBack streams a recording to a client instead. The
 * only channel that reaches that screen is the recorder's remote keypad, DVRIP
 * 1550 OPNetKeyboard. So the app logs in, checks the archive index for both
 * H.264 and H.265 as a readable diagnosis, then presses SEARCH, types the
 * wanted moment (yyyyMMddHHmmss), confirms and presses PLAY.
 *
 * Nothing is downloaded, no stream is opened and no player is launched: the
 * picture appears on the TV that is already connected to the DVR.
 *
 * The password comes from the app's own Settings screen at call time and is
 * never written to disk, logged, or returned to JS.
 */
class CctvPlaybackModule : Module() {
  companion object {
    private const val DEFAULT_PORT = 34567

    /** Diagnostic search window: the recorder clock may sit far from the phone clock. */
    private const val WINDOW_MINUTES = 120
  }

  private fun asInt(value: Any?, fallback: Int): Int = when (value) {
    is Number -> value.toInt()
    is String -> value.trim().toIntOrNull() ?: fallback
    else -> fallback
  }

  private fun asLong(value: Any?): Long? = when (value) {
    is Number -> value.toLong()
    is String -> value.trim().toLongOrNull()
    else -> null
  }

  private fun asText(value: Any?): String = (value as? String)?.trim() ?: ""

  override fun definition() = ModuleDefinition {
    Name("CctvPlayback")
    Events("onCctvEvent")

    AsyncFunction("playOnTv") { options: Map<String, Any?>, promise: Promise ->
      val ip = asText(options["ip"])
      val port = asInt(options["port"], DEFAULT_PORT)
      val user = asText(options["user"]).ifEmpty { "admin" }
      val password = options["password"] as? String ?: ""
      val channel = asInt(options["channel"], 1).coerceIn(1, 4)
      val clipStart = asLong(options["startMs"])

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

      Thread {
        var stage = "connecting"
        try {
          sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "connecting"))

          val client = DvripClient(ip, port, user, password)
          try {
            client.connect()

            stage = "login"
            sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "login"))
            client.login()

            // A refused or empty search must never block the keypad command:
            // the recorder's own search page may still find what DVRIP misses.
            stage = "query"
            val begin = DvripClient.stamp(Date(clipStart - WINDOW_MINUTES * 60_000L))
            val end = DvripClient.stamp(Date(clipStart + WINDOW_MINUTES * 60_000L))
            val query = client.queryBothFiles(begin, end, channel - 1)
            val queryDetail = query.attempts.joinToString(" | ")
            sendEvent(
              "onCctvEvent",
              mapOf("type" to "stage", "stage" to "query", "detail" to queryDetail)
            )

            stage = "keys"
            sendEvent("onCctvEvent", mapOf("type" to "stage", "stage" to "keys"))
            val presses = client.playArchiveOnMonitor(clipStart)

            promise.resolve(
              mapOf(
                "ok" to true,
                "recordings" to query.files.size,
                "query" to queryDetail,
                "keys" to presses.map { mapOf("key" to it.first, "ret" to it.second) }
              )
            )
            sendEvent("onCctvEvent", mapOf("type" to "done", "keys" to presses.size))
          } finally {
            try {
              client.close()
            } catch (ignored: Exception) {
            }
          }
        } catch (error: Exception) {
          val message = error.message ?: "TV playback failed"
          sendEvent(
            "onCctvEvent",
            mapOf("type" to "error", "stage" to stage, "message" to message)
          )
          promise.reject("E_TV_PLAYBACK", "$stage: $message", null)
        }
      }.start()
    }
  }
}
