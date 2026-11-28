import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { ScreenHeader } from '../components/ui';
import { dateTime } from '../utils/format';
import { useSettings } from '../store/SettingsContext';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';
import {
  archiveWindow,
  channelOf,
  dvripPortOf,
  transactionTimestamp,
} from '../utils/rtsp';
import { CCTV_LOG_SECTIONS } from '../utils/diagnostics';
import { useCctvDiagnosticsActions } from '../store/DiagnosticsContext';
import {
  addCctvListener,
  isAvailable as cctvAvailable,
  playOnTv,
} from '../../modules/cctv-playback';

const STAGE_LABELS = {
  connecting: 'اتصال',
  login: 'ورود',
  query: 'جستجو',
  keys: 'کلیدها',
  done: 'تکمیل',
  error: 'خطا',
};

/**
 * Transaction archive playback — ONE action, the DVR's own monitor is the player.
 *
 * Owner rules this screen enforces:
 *  - The recorder has no network verb that plays a recording on its HDMI/VGA
 *    output, so the app presses the DVR's own keypad (DVRIP 1550 OPNetKeyboard).
 *  - The ±120 minute file lookup is only a diagnosis: both H.264 and H.265 are
 *    queried and every device Ret is shown, never collapsed into an empty list.
 *  - No download, no stream, no VLC handoff, no live RTSP and no cancel path:
 *    a single button, one code path, so nothing can abort it halfway.
 */
export default function CctvPlayerScreen({ navigation, route }) {
  const { timestamp, customerName } = route.params || {};
  const { settings } = useSettings();
  const { logInfo, logWarning, logError } = useCctvDiagnosticsActions();
  useLang(); // re-render on language change

  const [state, setState] = useState('idle'); // idle | running | done | error | unavailable
  const [message, setMessage] = useState('');
  const [stage, setStage] = useState('');
  const [queryDetail, setQueryDetail] = useState('');

  // Single-flight guard: a second tap can never start a parallel DVRIP request.
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const stamp = useMemo(() => {
    if (!timestamp) return null;
    const parsed = dateTime(timestamp);
    return parsed?.date ? parsed : null;
  }, [timestamp]);

  const channel = channelOf(settings);
  const port = Number(dvripPortOf(settings)) || 34567;
  const hasPassword = Boolean(String(settings.dvrPassword || '').trim());

  const window = useMemo(() => {
    const when = transactionTimestamp(timestamp);
    if (!when) return null;
    return archiveWindow({ timestamp: when, leadMinutes: 120, tailMinutes: 120 });
  }, [timestamp]);

  // Stage / query / failure events from the native module. Each stage is copied
  // into the CCTV diagnostics log so a wrong port or a hidden DVRIP Ret is
  // visible without a debugger.
  useEffect(() => {
    const subscription = addCctvListener((event) => {
      if (!mountedRef.current) return;
      if (event.type === 'stage') {
        setStage(String(event.stage || ''));
        if (event.stage === 'query' && event.detail) {
          setQueryDetail(String(event.detail));
        }
        logInfo(
          CCTV_LOG_SECTIONS.PLAYBACK,
          `مرحله: ${event.stage || '—'}`,
          event.detail ? String(event.detail) : '',
        );
        return;
      }
      if (event.type === 'done') {
        setStage('done');
        return;
      }
      if (event.type === 'error' && !event.cancelled) {
        setState('error');
        setStage('error');
        const detail = event.message ? String(event.message) : '';
        setMessage(
          t('دستور پخش ناموفق بود ({reason}{detail}). پورت DVRIP فعلی: {port}', {
            reason: STAGE_LABELS[event.stage] || event.stage || 'خطا',
            detail: detail ? ` — ${detail}` : '',
            port,
          }),
        );
        logError(CCTV_LOG_SECTIONS.PLAYBACK, 'دستور پخش ناموفق بود', detail);
      }
    });
    return () => subscription.remove();
  }, [logError, logInfo, port]);

  const playClip = useCallback(async () => {
    if (busyRef.current) return;
    if (!cctvAvailable) {
      setState('unavailable');
      setMessage(
        t('پخش داخلی فقط در نسخهٔ نصبی برنامه فعال است؛ Expo Go سوکت DVRIP و پخش‌کنندهٔ بومی ندارد.'),
      );
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'دستور پخش روی مانیتور DVR در دسترس نیست',
        'ماژول بومی در Expo Go وجود ندارد؛ فقط در نسخهٔ نصبی فعال است.',
      );
      return;
    }
    if (!hasPassword) {
      setState('error');
      setMessage(t('برای ارسال دستور پخش، رمز DVR را در تنظیمات وارد کنید.'));
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'دستور پخش آغاز نشد',
        'رمز DVR ذخیره نشده است.',
      );
      return;
    }
    const when = transactionTimestamp(timestamp);
    if (!when || !window) {
      setState('error');
      setMessage(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'دستور پخش آغاز نشد', 'زمان تراکنش معتبر نیست.');
      return;
    }

    busyRef.current = true;
    setState('running');
    setStage('connecting');
    setQueryDetail('');
    setMessage(t('در حال ارسال دستور پخش...'));
    logInfo(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'ارسال دستور پخش به مانیتور DVR آغاز شد',
      `پورت DVRIP: ${port} • کانال ${channel} • ${window.startTime} تا ${window.endTime}`,
    );

    try {
      const result = await playOnTv({
        ip: settings.dvrIp,
        port,
        user: settings.dvrUser,
        password: settings.dvrPassword,
        channel,
        startMs: window.start,
      });

      if (!mountedRef.current) return;
      if (result?.ok) {
        setState('done');
        setStage('done');
        const detail = String(result.query || '');
        if (detail) setQueryDetail(detail);
        const presses = Array.isArray(result.keys) ? result.keys.length : 0;
        setMessage(t('آرشیو روی مانیتور DVR نمایش داده شد.'));
        logInfo(
          CCTV_LOG_SECTIONS.PLAYBACK,
          'آرشیو روی مانیتور DVR نمایش داده شد',
          `کلیدها: ${presses}${detail ? ` • ${detail}` : ''}`,
        );
        return;
      }

      const reason = result?.reason || 'unknown';
      const detail = result?.message ? ` — ${result.message}` : '';
      setState('error');
      setStage('error');
      setMessage(
        t('دستور پخش ناموفق بود ({reason}{detail}). پورت DVRIP فعلی: {port}', {
          reason,
          detail,
          port,
        }),
      );
      logError(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'دستور پخش ناموفق بود',
        `علت: ${reason} • پورت DVRIP: ${port}`,
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setState('error');
      setStage('error');
      setMessage(
        t('دستور پخش ناموفق بود ({reason}{detail}). پورت DVRIP فعلی: {port}', {
          reason: 'exception',
          detail: ` — ${error?.message || ''}`,
          port,
        }),
      );
      logError(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'دستور پخش ناموفق بود',
        String(error?.message || error),
      );
    } finally {
      busyRef.current = false;
    }
  }, [
    channel,
    hasPassword,
    logError,
    logInfo,
    logWarning,
    port,
    settings.dvrIp,
    settings.dvrPassword,
    settings.dvrUser,
    timestamp,
    window,
  ]);


  const running = state === 'running';

  const tone =
    state === 'done' ? styles.okText : state === 'error' || state === 'unavailable' ? styles.errText : styles.infoText;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('آرشیو دوربین')}
        subtitle={customerName || t('زمان تراکنش')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('زمان تراکنش')}</Text>
            <Text style={styles.rowValue}>
              {stamp ? `${stamp.date} • ${stamp.time}` : '—'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('بازهٔ آرشیو')}</Text>
            <Text style={styles.rowValue}>
              {window ? `${window.startTime} → ${window.endTime}` : '—'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('پورت DVRIP')}</Text>
            <Text style={styles.rowValue}>{String(port)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('مرحله')}</Text>
            <Text style={styles.rowValue}>
              {stage ? t(STAGE_LABELS[stage] || stage) : '—'}
            </Text>
          </View>
          {queryDetail ? (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('نتیجهٔ جستجو')}</Text>
                <Text style={styles.rowValue}>{queryDetail}</Text>
              </View>
            </>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.button, (running || !window) && styles.buttonDisabled]}
          onPress={playClip}
          disabled={running || !window}
          accessibilityRole="button"
          accessibilityLabel={t('نمایش آرشیو روی مانیتور DVR')}
        >
          {running ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Ionicons name="play" size={20} color={colors.white} />
          )}
          <Text style={styles.buttonText}>{t('نمایش آرشیو روی مانیتور DVR')}</Text>
        </TouchableOpacity>

        {message ? <Text style={[styles.message, tone]}>{message}</Text> : null}

        <Text style={styles.note}>
          {t(
            'جستجوی فایل آرشیو فقط برای تشخیص است و بازهٔ ±۱۲۰ دقیقه را بررسی میکند. تصویر روی مانیتور متصل به DVR نمایش داده میشود.',
          )}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  rowLabel: { fontSize: 13, color: colors.textSoft, writingDirection: 'rtl' },
  rowValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  divider: { height: 1, backgroundColor: colors.border },
  button: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  message: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  infoText: { color: colors.textSoft },
  okText: { color: colors.green },
  errText: { color: colors.red },
  note: {
    marginTop: 20,
    fontSize: 12,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
