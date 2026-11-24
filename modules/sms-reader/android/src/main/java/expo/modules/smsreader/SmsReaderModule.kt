package expo.modules.smsreader

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Bridges Android's SMS inbox to JS.
 *
 * - SmsReceiver stores every incoming SMS as JSON in SharedPreferences, so a
 *   payment is never missed while the app is closed.
 * - getPending()   returns that queue (newest first).
 * - clearPending() removes processed ids.
 * - readInbox()    backfills already-received messages via the SMS provider.
 * - The weekly Friday 10:00 reminder is scheduled natively with AlarmManager.
 *   JS only supplies a fresh snapshot; the native side rechecks the balance,
 *   per-customer slot latch and settings before every silent send.
 *
 * All payloads are JSON strings on purpose: it keeps the JS/native contract
 * trivial and avoids converter edge cases.
 */
class SmsReaderModule : Module() {
  companion object {
    const val PREFS_NAME = "sms_reader_store"
    const val KEY_PENDING = "pending_sms"
    const val MAX_PENDING = 100

    private const val KEY_WEEKLY_ENABLED = "weekly_enabled"
    private const val KEY_WEEKLY_CONTACTS = "weekly_contacts"
    private const val KEY_WEEKLY_SETTINGS = "weekly_settings"
    private const val KEY_WEEKLY_SENT = "weekly_sent"
    private const val KEY_WEEKLY_EVENTS = "weekly_events"
    private const val WEEKLY_REQUEST_CODE = 91001
    private const val DEFAULT_THRESHOLD = 1000.0
    private const val DEFAULT_WEEKLY_WEEKDAY = Calendar.FRIDAY // 6, native 1=Sun .. 7=Sat
    private const val DEFAULT_WEEKLY_HOUR = 10
    private const val DEFAULT_WEEKLY_MINUTE = 0
    private const val DAY_MS = 24L * 60L * 60L * 1000L

    @Volatile
    private var activeModule: SmsReaderModule? = null

    /** Called by SmsReceiver when the app process is alive. */
    fun emitReceived(payload: Map<String, Any?>) {
      activeModule?.sendEvent("onSmsReceived", payload)
    }

    /** Called after a successful weekly send so JS can mirror the per-customer latch. */
    fun emitWeeklySent(contactId: String, week: String) {
      activeModule?.sendEvent(
        "onWeeklySmsSent",
        mapOf("contactId" to contactId, "week" to week, "timestamp" to System.currentTimeMillis())
      )
    }

    /** Explicit alarm from WeeklyReminderReceiver. */
    fun handleWeeklyAlarm(context: Context) {
      runWeeklyReminder(context)
      scheduleNext(context)
    }

    /** Boot / package-replace: restore the alarm and catch up if still inside the due window. */
    fun handleBootOrUpdate(context: Context) {
      scheduleNext(context)
      runWeeklyReminder(context)
    }

    private fun prefs(context: Context): SharedPreferences =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun readJsonObject(prefs: SharedPreferences, key: String): JSONObject {
      val raw = prefs.getString(key, "{}") ?: "{}"
      return try {
        JSONObject(raw)
      } catch (error: Exception) {
        JSONObject()
      }
    }

    private fun readJsonArray(prefs: SharedPreferences, key: String): JSONArray {
      val raw = prefs.getString(key, "[]") ?: "[]"
      return try {
        JSONArray(raw)
      } catch (error: Exception) {
        JSONArray()
      }
    }

    private fun stringValue(map: Map<*, *>, key: String): String =
      map[key]?.toString()?.trim() ?: ""

    private fun boolValue(map: Map<*, *>, key: String, fallback: Boolean = false): Boolean {
      val value = map[key] ?: return fallback
      if (value is Boolean) return value
      return value.toString().equals("true", ignoreCase = true)
    }

    private fun numberValue(map: Map<*, *>, key: String, fallback: Double): Double {
      val value = map[key] ?: return fallback
      if (value is Number) return value.toDouble()
      return value.toString().toDoubleOrNull() ?: fallback
    }

    private fun weeklySlotKey(nowMs: Long, weekday: Int = DEFAULT_WEEKLY_WEEKDAY, hour: Int = DEFAULT_WEEKLY_HOUR, minute: Int = DEFAULT_WEEKLY_MINUTE): String? {
      val calendar = Calendar.getInstance()
      calendar.timeInMillis = nowMs
      calendar.set(Calendar.HOUR_OF_DAY, hour)
      calendar.set(Calendar.MINUTE, minute)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      val delta = (calendar.get(Calendar.DAY_OF_WEEK) - weekday + 7) % 7
      calendar.add(Calendar.DATE, -delta)
      return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.time)
    }

    private fun slotStartMs(slot: String, hour: Int = DEFAULT_WEEKLY_HOUR, minute: Int = DEFAULT_WEEKLY_MINUTE): Long? {
      val parsed = try {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(slot)
      } catch (error: Exception) {
        null
      } ?: return null
      val calendar = Calendar.getInstance()
      calendar.time = parsed
      calendar.set(Calendar.HOUR_OF_DAY, hour)
      calendar.set(Calendar.MINUTE, minute)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      return calendar.timeInMillis
    }

    private fun inWeeklyDueWindow(nowMs: Long, slot: String, hour: Int = DEFAULT_WEEKLY_HOUR, minute: Int = DEFAULT_WEEKLY_MINUTE): Boolean {
      val start = slotStartMs(slot, hour, minute) ?: return false
      return nowMs >= start && nowMs < start + DAY_MS
    }

    private fun nextTriggerMs(nowMs: Long, weekday: Int = DEFAULT_WEEKLY_WEEKDAY, hour: Int = DEFAULT_WEEKLY_HOUR, minute: Int = DEFAULT_WEEKLY_MINUTE): Long {
      val calendar = Calendar.getInstance()
      calendar.timeInMillis = nowMs
      calendar.set(Calendar.HOUR_OF_DAY, hour)
      calendar.set(Calendar.MINUTE, minute)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      val delta = (calendar.get(Calendar.DAY_OF_WEEK) - weekday + 7) % 7
      calendar.add(Calendar.DATE, -delta)
      val thisSlot = calendar.timeInMillis
      if (nowMs < thisSlot) return thisSlot
      if (nowMs < thisSlot + DAY_MS) return nowMs + 1000L
      calendar.add(Calendar.DATE, 7)
      return calendar.timeInMillis
    }

    private fun cancelNext(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
      val intent = Intent(context, WeeklyReminderReceiver::class.java)
      intent.action = WeeklyReminderReceiver.ACTION_WEEKLY
      val pending = PendingIntent.getBroadcast(context, WEEKLY_REQUEST_CODE, intent, flags)
      alarmManager.cancel(pending)
    }

    private fun scheduleNext(context: Context) {
      val storage = prefs(context)
      if (!storage.getBoolean(KEY_WEEKLY_ENABLED, false)) {
        cancelNext(context)
        return
      }

      val weekday = storage.getInt("weekly_weekday", DEFAULT_WEEKLY_WEEKDAY)
      val hour = storage.getInt("weekly_hour", DEFAULT_WEEKLY_HOUR)
      val minute = storage.getInt("weekly_minute", DEFAULT_WEEKLY_MINUTE)

      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
      val intent = Intent(context, WeeklyReminderReceiver::class.java)
      intent.action = WeeklyReminderReceiver.ACTION_WEEKLY
      val pending = PendingIntent.getBroadcast(context, WEEKLY_REQUEST_CODE, intent, flags)
      val triggerAt = nextTriggerMs(System.currentTimeMillis(), weekday, hour, minute)
      try {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
      } catch (error: SecurityException) {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
      }
    }

    private fun hasSendPermission(context: Context): Boolean =
      context.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED

    private fun sendSmsNow(context: Context, destination: String, body: String): Boolean {
      val target = destination.trim()
      if (target.isEmpty() || body.isBlank() || !hasSendPermission(context)) return false
      return try {
        val manager = context.getSystemService(SmsManager::class.java) ?: return false
        val parts = manager.divideMessage(body)
        if (parts.size <= 1) {
          manager.sendTextMessage(target, null, body, null, null)
        } else {
          manager.sendMultipartTextMessage(target, null, parts, null, null)
        }
        true
      } catch (error: Exception) {
        false
      }
    }

    private fun appendWeeklyEvent(context: Context, contactId: String, week: String) {
      val storage = prefs(context)
      val events = readJsonArray(storage, KEY_WEEKLY_EVENTS)
      val item = JSONObject()
      item.put("contactId", contactId)
      item.put("week", week)
      item.put("timestamp", System.currentTimeMillis())
      events.put(item)

      val capped = JSONArray()
      val start = maxOf(0, events.length() - 100)
      for (index in start until events.length()) {
        val entry = events.optJSONObject(index) ?: continue
        capped.put(entry)
      }
      storage.edit().putString(KEY_WEEKLY_EVENTS, capped.toString()).apply()
      emitWeeklySent(contactId, week)
    }

    private fun runWeeklyReminder(context: Context) {
      val storage = prefs(context)
      if (!storage.getBoolean(KEY_WEEKLY_ENABLED, false)) return

      val settings = readJsonObject(storage, KEY_WEEKLY_SETTINGS)
      if (!settings.optBoolean("settingsReady", false)) return
      val threshold = settings.optDouble("threshold", DEFAULT_THRESHOLD)
      val weekday = settings.optInt("weekday", DEFAULT_WEEKLY_WEEKDAY)
      val hour = settings.optInt("hour", DEFAULT_WEEKLY_HOUR)
      val minute = settings.optInt("minute", DEFAULT_WEEKLY_MINUTE)

      val now = System.currentTimeMillis()
      val slot = weeklySlotKey(now, weekday, hour, minute) ?: return
      if (!inWeeklyDueWindow(now, slot, hour, minute)) return

      val sent = readJsonObject(storage, KEY_WEEKLY_SENT)
      val contacts = readJsonArray(storage, KEY_WEEKLY_CONTACTS)
      var changed = false

      for (index in 0 until contacts.length()) {
        val contact = contacts.optJSONObject(index) ?: continue
        val id = contact.optString("id", "")
        val phone = contact.optString("phone", "")
        val body = contact.optString("body", "")
        if (id.isEmpty() || phone.isEmpty() || body.isEmpty()) continue

        // Per-customer weekly reminder opt-out: skip if weeklyReminderEnabled is false
        val weeklyReminderEnabled = contact.optBoolean("weeklyReminderEnabled", true)
        if (!weeklyReminderEnabled) continue

        val storedWeek = sent.optString(id, "")
        val weeklyWeek = contact.optString("weeklySmsSentWeek", "")
        val crossingWeek = contact.optString("crossingSmsSentWeek", "")
        if (storedWeek == slot || weeklyWeek == slot || crossingWeek == slot) {
          if (storedWeek != slot) {
            sent.put(id, slot)
            changed = true
          }
          continue
        }

        if (contact.optDouble("balance", 0.0) <= threshold) continue
        if (!hasSendPermission(context)) continue
        if (!sendSmsNow(context, phone, body)) continue

        sent.put(id, slot)
        changed = true
        appendWeeklyEvent(context, id, slot)
      }

      if (changed) {
        storage.edit().putString(KEY_WEEKLY_SENT, sent.toString()).apply()
      }
    }

    private fun contactsFromSnapshot(snapshot: Map<String, Any?>): JSONArray {
      val result = JSONArray()
      val contacts = snapshot["contacts"] as? List<*> ?: emptyList<Any?>()
      for (item in contacts) {
        val contact = item as? Map<*, *> ?: continue
        val json = JSONObject()
        json.put("id", stringValue(contact, "id"))
        json.put("name", stringValue(contact, "name"))
        json.put("phone", stringValue(contact, "phone"))
        json.put("balance", numberValue(contact, "balance", 0.0))
        json.put("weeklySmsSentWeek", stringValue(contact, "weeklySmsSentWeek"))
        json.put("crossingSmsSentWeek", stringValue(contact, "crossingSmsSentWeek"))
        json.put("body", stringValue(contact, "body"))
        result.put(json)
      }
      return result
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
    Events("onSmsReceived", "onWeeklySmsSent")

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

    // ── Weekly Friday 10:00 reminder ───────────────────────────────────────
    // JS sends a fresh snapshot; the native side owns the alarm, the per-user
    // sent map, and the actual silent SmsManager send.
    // Weekday convention crossing the bridge is java.util.Calendar (1=Sun..7=Sat);
    // JS converts its 0..6 value with toNativeWeekday() before calling in.

    AsyncFunction("setWeeklyReminderConfig") { config: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "reason" to "unavailable")
      val enabled = boolValue(config, "enabled", false)
      val weekday = numberValue(config, "weekday", DEFAULT_WEEKLY_WEEKDAY.toDouble()).toInt()
      val hour = numberValue(config, "hour", DEFAULT_WEEKLY_HOUR.toDouble()).toInt()
      val minute = numberValue(config, "minute", DEFAULT_WEEKLY_MINUTE.toDouble()).toInt()
      val storage = prefs(context)
      storage.edit()
        .putBoolean(KEY_WEEKLY_ENABLED, enabled)
        .putInt("weekly_weekday", weekday)
        .putInt("weekly_hour", hour)
        .putInt("weekly_minute", minute)
        .apply()
      if (enabled) {
        scheduleNext(context)
        runWeeklyReminder(context)
      } else {
        cancelNext(context)
      }
      mapOf("ok" to true, "enabled" to enabled)
    }

    AsyncFunction("syncWeeklyReminder") { snapshot: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "reason" to "unavailable")
      val storage = prefs(context)
      val enabled = boolValue(snapshot, "enabled", storage.getBoolean(KEY_WEEKLY_ENABLED, false))
      val weekday = numberValue(snapshot, "weekday", DEFAULT_WEEKLY_WEEKDAY.toDouble()).toInt()
      val hour = numberValue(snapshot, "hour", DEFAULT_WEEKLY_HOUR.toDouble()).toInt()
      val minute = numberValue(snapshot, "minute", DEFAULT_WEEKLY_MINUTE.toDouble()).toInt()

      val contacts = contactsFromSnapshot(snapshot)
      val settings = JSONObject()
      settings.put("threshold", numberValue(snapshot, "threshold", DEFAULT_THRESHOLD))
      settings.put("settingsReady", boolValue(snapshot, "settingsReady", false))
      settings.put("cardNumber", stringValue(snapshot, "cardNumber"))
      settings.put("weekday", weekday)
      settings.put("hour", hour)
      settings.put("minute", minute)

      storage.edit()
        .putBoolean(KEY_WEEKLY_ENABLED, enabled)
        .putInt("weekly_weekday", weekday)
        .putInt("weekly_hour", hour)
        .putInt("weekly_minute", minute)
        .putString(KEY_WEEKLY_CONTACTS, contacts.toString())
        .putString(KEY_WEEKLY_SETTINGS, settings.toString())
        .apply()

      val sent = readJsonObject(storage, KEY_WEEKLY_SENT)
      var sentChanged = false
      for (index in 0 until contacts.length()) {
        val contact = contacts.optJSONObject(index) ?: continue
        val id = contact.optString("id", "")
        if (id.isEmpty()) continue
        val weeklyWeek = contact.optString("weeklySmsSentWeek", "")
        val crossingWeek = contact.optString("crossingSmsSentWeek", "")
        val marker = if (weeklyWeek.isNotEmpty()) weeklyWeek else crossingWeek
        if (marker.isNotEmpty() && sent.optString(id, "") != marker) {
          sent.put(id, marker)
          sentChanged = true
        }
      }
      if (sentChanged) {
        storage.edit().putString(KEY_WEEKLY_SENT, sent.toString()).apply()
      }

      if (enabled) {
        scheduleNext(context)
        runWeeklyReminder(context)
      } else {
        cancelNext(context)
      }
      mapOf("ok" to true, "enabled" to enabled, "contacts" to contacts.length())
    }

    AsyncFunction("drainWeeklySmsEvents") {
      val storage = prefsOrNull()
        ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val events = readJsonArray(storage, KEY_WEEKLY_EVENTS)
      val drained = mutableListOf<Map<String, Any?>>()
      for (index in 0 until events.length()) {
        val event = events.optJSONObject(index) ?: continue
        drained.add(
          mapOf(
            "contactId" to event.optString("contactId", ""),
            "week" to event.optString("week", ""),
            "timestamp" to event.optLong("timestamp", 0L)
          )
        )
      }
      storage.edit().remove(KEY_WEEKLY_EVENTS).apply()
      drained
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
