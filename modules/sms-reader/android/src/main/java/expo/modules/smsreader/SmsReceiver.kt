package expo.modules.smsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject

/**
 * Receives android.provider.Telephony.SMS_RECEIVED, merges multipart messages,
 * and appends them to a small JSON queue in SharedPreferences. Works while the
 * app is closed — the JS layer drains the queue on next launch.
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (parts.isEmpty()) return

    // A long SMS arrives as several parts sharing one sender: join them.
    val bodies = LinkedHashMap<String, StringBuilder>()
    val timestamps = HashMap<String, Long>()
    for (part in parts) {
      val address = part.originatingAddress ?: "unknown"
      val text = part.messageBody ?: ""
      val existing = bodies[address]
      if (existing == null) {
        bodies[address] = StringBuilder(text)
        timestamps[address] = part.timestampMillis
      } else {
        existing.append(text)
      }
    }

    val prefs = context.getSharedPreferences(SmsReaderModule.PREFS_NAME, Context.MODE_PRIVATE)
    var stored = JSONArray()
    val raw = prefs.getString(SmsReaderModule.KEY_PENDING, "[]") ?: "[]"
    runCatching {
      val parsed = JSONArray(raw)
      for (index in 0 until parsed.length()) {
        parsed.optJSONObject(index)?.let { stored.put(it) }
      }
    }

    for ((address, builder) in bodies) {
      val body = builder.toString().trim()
      if (body.isEmpty()) continue

      val timestamp = timestamps[address] ?: System.currentTimeMillis()
      val id = "live-$address-$timestamp-${body.hashCode()}"

      var duplicate = false
      for (index in 0 until stored.length()) {
        if (stored.optJSONObject(index)?.optString("id") == id) {
          duplicate = true
          break
        }
      }
      if (duplicate) continue

      val item = JSONObject()
      item.put("id", id)
      item.put("address", address)
      item.put("body", body)
      item.put("timestamp", timestamp)

      // Newest first, capped so SharedPreferences stays small.
      val merged = JSONArray()
      merged.put(item)
      val keep = minOf(stored.length(), SmsReaderModule.MAX_PENDING - 1)
      for (index in 0 until keep) {
        stored.optJSONObject(index)?.let { merged.put(it) }
      }

      prefs.edit().putString(SmsReaderModule.KEY_PENDING, merged.toString()).apply()
      // Keep the in-memory queue current for a possible second sender.
      stored = JSONArray(merged.toString())
      SmsReaderModule.emitReceived(
        mapOf(
          "id" to id,
          "address" to address,
          "body" to body,
          "timestamp" to timestamp
        )
      )
    }
  }
}
