package expo.modules.smsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Native alarm + boot receiver for the weekly Friday 10:00 reminder.
 *
 * The alarm is explicit (ACTION_WEEKLY). Boot/package-replace only re-arm the
 * alarm and catch up when the phone starts inside the Friday due window.
 */
class WeeklyReminderReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_WEEKLY = "expo.modules.smsreader.WEEKLY_REMINDER"
    private const val ACTION_QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val appContext = context.applicationContext
    when (intent.action) {
      ACTION_WEEKLY -> SmsReaderModule.handleWeeklyAlarm(appContext)
      Intent.ACTION_BOOT_COMPLETED,
      ACTION_QUICKBOOT_POWERON,
      Intent.ACTION_MY_PACKAGE_REPLACED -> SmsReaderModule.handleBootOrUpdate(appContext)
    }
  }
}
