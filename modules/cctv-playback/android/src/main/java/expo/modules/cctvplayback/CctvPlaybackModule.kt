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

  private fun asInt(value: Any?, fallback: Int): Int = when (value) {
    is Number -> value.toInt()
    is String -> value.trim().toIntOrNull() ?: fallback
    else -> fallback
  }

  /** Keeps the cache bounded: only the two newest clips survive. */
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
        promise.reject("E_CONFIG", "DVR address is empty")
        return@AsyncFunction
      }
      if (port !in 1..65535) {
        promise.reject("E_CONFIG", "DVR port is invalid")
        return@AsyncFunction
      }
      if (clipStart == null) {
        promise.reject("E_CONFIG", "Transaction time is invalid")
        return@AsyncFunction
      }

      val endMs = clipEnd ?: (clipStart + 10 * 60_000L)
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_CONTEXT", "App context is unavailable")
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

          // JS publishes the clip through the FileProvider and opens VLC. VLC
          // is the player — this module only fetches the recording.
          promise.resolve(
            mapOf(
              "ok" to true,
              "path" to target.absolutePath,
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
          promise.reject(if (cancelRequested) "E_CANCELLED" else "E_DVRIP", message)
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

    AsyncFunction("stop") {
      cancelRequested = true
      val client = activeClient
      try { client?.cancelled = true } catch (_: Exception) { }
      // A blocked DVRIP read only unblocks when the socket goes away.
      try { client?.close() } catch (_: Exception) { }
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
        promise.reject("E_VLC_OPEN", error.message ?: "could not open the video player")
      }
    }
  }
}
