package expo.modules.smsreader

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bridges Android's SMS inbox to JS.
 *
 * - SmsReceiver stores every incoming SMS as JSON in SharedPreferences, so a
 *   payment is never missed while the app is closed.
 * - getPending()   returns that queue (newest first).
 * - clearPending() removes processed ids.
 * - readInbox()    backfills already-received messages via the SMS provider.
 *
 * All payloads are JSON strings on purpose: it keeps the JS/native contract
 * trivial and avoids converter edge cases.
 */
class SmsReaderModule : Module() {
  companion object {
    const val PREFS_NAME = "sms_reader_store"
    const val KEY_PENDING = "pending_sms"
    const val MAX_PENDING = 100

    @Volatile
    private var activeModule: SmsReaderModule? = null

    /** Called by SmsReceiver when the app process is alive. */
    fun emitReceived(payload: Map<String, Any?>) {
      activeModule?.sendEvent("onSmsReceived", payload)
    }
  }

  private fun prefsOrNull(): SharedPreferences? {
    val context = appContext.reactContext ?: return null
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  private fun readQueue(prefs: SharedPreferences): JSONArray {
    val raw = prefs.getString(KEY_PENDING, "[]") ?: "[]"
    return try {
      JSONArray(raw)
    } catch (error: Exception) {
      JSONArray()
    }
  }

  private fun readInboxJson(context: Context, sinceMs: Long, limit: Int): String {
    val result = JSONArray()
    val uri = Uri.parse("content://sms/inbox")
    val projection = arrayOf("_id", "address", "body", "date")
    var cursor: Cursor? = null
    try {
      cursor = context.contentResolver.query(
        uri,
        projection,
        "date > ?",
        arrayOf(sinceMs.toString()),
        "date DESC"
      )
      if (cursor != null) {
        val idIndex = cursor.getColumnIndex("_id")
        val addressIndex = cursor.getColumnIndex("address")
        val bodyIndex = cursor.getColumnIndex("body")
        val dateIndex = cursor.getColumnIndex("date")
        var count = 0
        while (cursor.moveToNext() && count < limit) {
          val body = if (bodyIndex >= 0) cursor.getString(bodyIndex) ?: "" else ""
          if (body.isBlank()) continue
          val item = JSONObject()
          item.put("id", "inbox-" + if (idIndex >= 0) cursor.getString(idIndex) else count.toString())
          item.put("address", if (addressIndex >= 0) cursor.getString(addressIndex) ?: "" else "")
          item.put("body", body)
          item.put("timestamp", if (dateIndex >= 0) cursor.getLong(dateIndex) else 0L)
          result.put(item)
          count += 1
        }
      }
    } catch (error: Exception) {
      // READ_SMS not granted or the provider is unavailable: return what we have.
    } finally {
      cursor?.close()
    }
    return result.toString()
  }

  override fun definition() = ModuleDefinition {
    Name("SmsReader")
    Events("onSmsReceived")

    OnCreate {
      activeModule = this@SmsReaderModule
    }

    OnDestroy {
      if (activeModule === this@SmsReaderModule) activeModule = null
    }

    AsyncFunction("getPending") {
      val prefs = prefsOrNull()
      if (prefs == null) "[]" else readQueue(prefs).toString()
    }

    AsyncFunction("clearPending") { ids: List<String> ->
      val prefs = prefsOrNull() ?: return@AsyncFunction 0
      val queue = readQueue(prefs)
      val keep = JSONArray()
      for (index in 0 until queue.length()) {
        val item = queue.optJSONObject(index) ?: continue
        if (!ids.contains(item.optString("id"))) {
          keep.put(item)
        }
      }
      prefs.edit().putString(KEY_PENDING, keep.toString()).apply()
      keep.length()
    }

    AsyncFunction("readInbox") { since: Double, limit: Int ->
      val context = appContext.reactContext
      if (context == null) "[]" else readInboxJson(context, since.toLong(), limit)
    }

    // ── Silent sending ────────────────────────────────────────────────────
    // True background send via SmsManager: no messaging app, no Send button.
    // Requires the SEND_SMS runtime permission (requested from JS through
    // PermissionsAndroid, granted once by the user).

    AsyncFunction("hasSendSmsPermission") {
      val context = appContext.reactContext
      context != null &&
        context.checkSelfPermission(Manifest.permission.SEND_SMS) ==
        PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("sendSms") { destination: String, body: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "reason" to "unavailable")

      val target = destination.trim()
      if (target.isEmpty()) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "destination")
      }
      if (body.isBlank()) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "empty")
      }
      if (context.checkSelfPermission(Manifest.permission.SEND_SMS) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "permission")
      }

      try {
        val smsManager = context.getSystemService(SmsManager::class.java)
        // Persian text is UCS-2: ~70 chars per segment, so the reminder is
        // always multipart — divideMessage/sendMultipartTextMessage handles it.
        val parts = smsManager.divideMessage(body)
        if (parts.size <= 1) {
          smsManager.sendTextMessage(target, null, body, null, null)
        } else {
          smsManager.sendMultipartTextMessage(target, null, parts, null, null)
        }
        mapOf("ok" to true)
      } catch (error: Exception) {
        mapOf(
          "ok" to false,
          "reason" to "error",
          "message" to (error.message ?: "unknown")
        )
      }
    }
  }
}
