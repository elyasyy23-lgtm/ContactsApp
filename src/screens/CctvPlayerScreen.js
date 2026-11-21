import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';
import { ScreenHeader } from '../components/ui';
import { dateTime } from '../utils/format';
import { useSettings } from '../store/SettingsContext';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';
import {
  archiveWindow,
  buildGuestArchiveUrl,
  buildPlaybackCandidates,
  channelOf,
  dvripPortOf,
  maskRtspUrl,
  safeRtspPort,
  transactionTimestamp,
} from '../utils/rtsp';
import { triggerTVPlayback } from '../utils/tvPlayback';
import { CCTV_LOG_SECTIONS } from '../utils/diagnostics';
import { useCctvDiagnosticsActions } from '../store/DiagnosticsContext';
import {
  addCctvListener,
  isAvailable as cctvAvailable,
  playArchive,
  probeRtsp,
} from '../../modules/cctv-playback';
import { openInVlc, openLocalFileInVlc } from '../utils/vlc';

/**
 * CCTV archive screen. VLC is the video player.
 *
 * Owner rule: archive playback must work like the live stream — NO password.
 *
 * 1. Primary path: a credential-free RTSP archive URL on the RTSP port (554,
 *    never the DVRIP control port 34567), handed straight to VLC. It carries no
 *    userinfo and no `password=` value, so VLC can never raise its own
 *    "RTSP authentication" dialog; the DVR answers as a guest.
 * 2. Optional path (only when a DVR password is stored): the `cctv-playback`
 *    module logs in over DVRIP, downloads the clip and VLC opens a LOCAL file,
 *    which also needs no credentials.
 * 3. Expo Go: no DVRIP socket, so only path 1 is possible; the screen says so
 *    plainly instead of pretending.
 */
const CANDIDATE_LABELS = {
  'archive-guest-xm': 'آرشیو • بدون رمز (مسیر اصلی دستگاه)',
  'archive-guest-xm-bare': 'آرشیو • بدون هیچ پارامتر ورود',
  'archive-guest-dahua': 'آرشیو • بدون رمز (زمان محلی)',
  'archive-guest-dahua-utc': 'آرشیو • بدون رمز (زمان UTC)',
  'archive-auth-xm': 'آرشیو • با رمز ذخیره‌شده در مسیر (بدون پنجرهٔ رمز)',
  'live-guest-xm': 'پخش زنده بدون رمز (تست دسترسی)',
  'live-auth-xm': 'پخش زنده با رمز ذخیره‌شده (تست دسترسی)',
};

export default function CctvPlayerScreen({ navigation, route }) {
  const { timestamp, customerName } = route.params || {};
  const { settings } = useSettings();
  const { logInfo, logWarning, logError } = useCctvDiagnosticsActions();
  useLang(); // re-render when the app language changes
  const [tvStatus, setTvStatus] = useState('checking');
  const [tvText, setTvText] = useState('');
  const sessionClosedRef = useRef(false);

  const stamp = useMemo(() => {
    if (!timestamp) return null;
    const parsed = dateTime(timestamp);
    return parsed?.date ? parsed : null;
  }, [timestamp]);

  // Video always goes to the RTSP port; a stale/incorrect value (e.g. the
  // DVRIP control port 34567) is corrected to 554 instead of being used.
  const rtspPort = safeRtspPort(settings.rtspPort);
  const channel = channelOf(settings);
  const hasPassword = Boolean(String(settings.dvrPassword || '').trim());

  // Password-free archive URL — the default action. No userinfo, no password.
  const rtspUrl = useMemo(
    () =>
      buildGuestArchiveUrl({
        ip: settings.dvrIp,
        port: rtspPort,
        channel,
        timestamp,
      }),
    [settings.dvrIp, rtspPort, channel, timestamp],
  );

  // Ordered, credential-free fallbacks: the shop DVR is an Xiongmai box whose
  // RTSP server documents live streaming, so the archive path is settled by
  // trying the documented guest shapes. First entry is the default action.
  const candidates = useMemo(
    () =>
      buildPlaybackCandidates({
        ip: settings.dvrIp,
        rtspPort,
        user: settings.dvrUser,
        pass: settings.dvrPassword,
        channel,
        timestamp,
      }),
    [settings.dvrIp, rtspPort, settings.dvrUser, settings.dvrPassword, channel, timestamp],
  );

  const maskedUrl = useMemo(() => maskRtspUrl(rtspUrl), [rtspUrl]);

  // ── primary path: credential-free RTSP straight into VLC ───────────────────
  const [guestStatus, setGuestStatus] = useState('idle');
  const [guestText, setGuestText] = useState('');

  const playGuestArchive = useCallback(async () => {
    if (!candidates.length) {
      setGuestStatus('error');
      setGuestText(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'پخش آرشیو آغاز نشد', 'زمان تراکنش یا تنظیمات DVR معتبر نیست.');
      return;
    }
    setGuestStatus('running');
    setGuestText('');

    // Installed build: ask the DVR first and hand VLC only a URL that already
    // answered 2xx. A 401 URL would make VLC raise its own password dialog,
    // which is exactly what must never happen.
    let chosen = candidates[0].url;
    let chosenKey = candidates[0].key;
    if (cctvAvailable) {
      let sawAuth = false;
      let networkFail = false;
      let playable = false;
      for (const candidate of candidates) {
        const probe = await probeRtsp(candidate.url);
        if (probe.ok) {
          chosen = candidate.url;
          chosenKey = candidate.key;
          playable = true;
          break;
        }
        if (probe.status === 401 || probe.status === 403) sawAuth = true;
        if (probe.status === 0) networkFail = true;
      }
      if (!playable) {
        setGuestStatus('error');
        if (sawAuth && !hasPassword) {
          setGuestText(
            t(
              'این دستگاه پخش مهمان (بدون رمز) را نمی‌پذیرد. رمز دوربین را در تنظیمات وارد کنید تا بدون هیچ پنجرهٔ رمزی پخش شود.',
            ),
          );
          logWarning(
            CCTV_LOG_SECTIONS.PLAYBACK,
            'دستگاه پخش بدون رمز را رد کرد',
            'پاسخ ۴۰۱ به همهٔ مسیرهای مهمان؛ رمز دوربین لازم است.',
          );
        } else if (sawAuth && hasPassword) {
          setGuestText(t('رمز ذخیره‌شده پذیرفته نشد. رمز دوربین را در تنظیمات بررسی کنید.'));
          logWarning(
            CCTV_LOG_SECTIONS.PLAYBACK,
            'رمز ذخیره‌شده پذیرفته نشد',
            'پاسخ ۴۰۱ با مسیر دارای رمز.',
          );
        } else if (networkFail) {
          setGuestText(t('دستگاه دوربین در شبکه پاسخ نداد. اتصال وای‌فای و آدرس دستگاه را بررسی کنید.'));
          logError(CCTV_LOG_SECTIONS.PLAYBACK, 'دستگاه دوربین در دسترس نیست', 'اتصال شبکه برقرار نشد.');
        } else {
          setGuestText(t('هیچ‌کدام از مسیرهای آرشیو پاسخ قابل پخش نداد.'));
          logWarning(CCTV_LOG_SECTIONS.PLAYBACK, 'مسیر آرشیو پیدا نشد');
        }
        return;
      }
    }

    logInfo(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'ارسال آرشیو به VLC (بدون پنجرهٔ رمز)',
      `گزینه: ${chosenKey} • کانال ${channel} • پورت RTSP ${rtspPort}`,
    );
    const opened = await openInVlc(chosen, { mimeType: 'video/*' });
    if (opened.ok) {
      setGuestStatus('done');
      setGuestText(t('آرشیو در VLC باز شد. اگر تصویر سیاه ماند، گزینهٔ بعدی را امتحان کنید.'));
      logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'آرشیو در VLC باز شد', `گزینه: ${chosenKey}`);
      return;
    }
    setGuestStatus('error');
    setGuestText(
      opened.reason === 'no-app'
        ? t('هیچ پخش‌کننده‌ای برای این لینک پیدا نشد.')
        : t('پخش‌کننده لینک را نپذیرفت.'),
    );
    logWarning(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'ارسال آرشیو به VLC ناموفق بود',
      `گزینه: ${chosenKey} • علت: ${opened.reason || 'unknown'}`,
    );
  }, [candidates, hasPassword, channel, rtspPort, t, logInfo, logWarning, logError]);

  // ── native archive playback (optional: needs a stored DVR password) ───────
  const [playState, setPlayState] = useState('idle');
  const [playText, setPlayText] = useState('');
  const [received, setReceived] = useState(null);

  useEffect(() => {
    const subscription = addCctvListener((event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'progress') {
        setReceived({ bytes: Number(event.bytes) || 0, total: Number(event.total) || 0 });
        return;
      }
      if (event.type === 'error') {
        setReceived(null);
        return;
      }
    });
    return () => subscription.remove();
  }, []);

  const playClip = useCallback(async () => {
    if (!cctvAvailable) {
      setPlayState('unavailable');
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'پخش داخلی آرشیو در دسترس نیست',
        'ماژول بومی در Expo Go وجود ندارد؛ فقط در نسخهٔ نصبی فعال است.',
      );
      return;
    }
    const when = transactionTimestamp(timestamp);
    if (!when) {
      setPlayState('error');
      setPlayText(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'پخش آرشیو آغاز نشد', 'زمان تراکنش معتبر نیست.');
      return;
    }
    const window = archiveWindow({ timestamp: when });
    if (!window) {
      setPlayState('error');
      setPlayText(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'پخش آرشیو آغاز نشد', 'بازهٔ زمانی ساخته نشد.');
      return;
    }
    const port = Number(dvripPortOf(settings));
    setPlayState('running');
    setReceived(null);
    setPlayText(t('در حال دریافت آرشیو از دستگاه...'));
    logInfo(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'دریافت آرشیو از دستگاه آغاز شد',
      `پورت DVRIP: ${port} • کانال ${channel} • ${window.startTime} تا ${window.endTime}`,
    );
    const result = await playArchive({
      ip: settings.dvrIp,
      port,
      user: settings.dvrUser,
      password: settings.dvrPassword,
      channel,
      startMs: window.start,
      endMs: window.end,
    });
    if (result?.ok) {
      const played = await openLocalFileInVlc(result.path, { mimeType: 'video/*' });
      if (played.ok) {
        setPlayState('done');
        setPlayText(
          t('آرشیو دریافت شد و در VLC باز شد ({mb} مگابایت).', {
            mb: (Number(result.bytes || 0) / 1048576).toFixed(1),
          }),
        );
        logInfo(
          CCTV_LOG_SECTIONS.PLAYBACK,
          'آرشیو دریافت و در VLC باز شد',
          `${result.file || ''} • ${Number(result.bytes || 0)} بایت`,
        );
        return;
      }
      setPlayState('done');
      setPlayText(
        t('آرشیو دریافت شد ({mb} مگابایت) ولی باز شدن VLC ممکن نشد.', {
          mb: (Number(result.bytes || 0) / 1048576).toFixed(1),
        }),
      );
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'باز شدن VLC ممکن نشد',
        `علت: ${played.reason || 'unknown'}`,
      );
      return;
    }
    const reason = result?.reason || 'unknown';
    setPlayState('error');
    setPlayText(t('دریافت آرشیو ناموفق بود ({reason}).', { reason }));
    logError(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'دریافت آرشیو ناموفق بود',
      `علت: ${reason} • پورت DVRIP: ${port}`,
    );
  }, [
    channel,
    settings.dvrIp,
    settings.dvrPort,
    settings.dvrUser,
    settings.dvrPassword,
    t,
    timestamp,
    logInfo,
    logWarning,
    logError,
  ]);


  const sendToTv = useCallback(async () => {
    if (!rtspUrl) {
      setTvStatus('error');
      setTvText(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'پخش آرشیو آغاز نشد',
        'زمان تراکنش یا تنظیمات DVR معتبر نیست.',
      );
      return;
    }
    setTvStatus('checking');
    setTvText('');
    logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'درخواست پخش آرشیو دوربین آغاز شد');
    const result = await triggerTVPlayback({
      ip: settings.dvrIp,
      port: settings.dvrPort,
      rtspPort,
      channel,
      timestamp,
    });
    if (result?.ok) {
      setTvStatus('sent');
      setTvText(t('دستور پخش ارسال شد.'));
      logInfo(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'دستور پخش آرشیو ارسال شد',
        `پاسخ DVR: HTTP ${result.status || 200}`,
      );
      return;
    }
    if (result?.reason === 'not-configured') {
      setTvStatus('notice');
      setTvText(
        t('آدرس CGI پخش تلویزیون هنوز تنظیم نشده است. لینک RTSP: {url}', { url: maskedUrl }),
      );
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'پخش روی تلویزیون تنظیم نشده است',
        'آدرس CGI پخش تلویزیون خالی است.',
      );
      return;
    }
    const reason = result?.reason || 'unknown';
    setTvStatus('error');
    setTvText(t('دستور پخش ارسال نشد ({reason}).', { reason }));
    logError(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'ارسال دستور پخش آرشیو ناموفق بود',
      reason === 'http' ? `پاسخ نامعتبر از DVR: HTTP ${result?.status || 0}` : 'خطای شبکه در تماس با DVR.',
    );
  }, [
    maskedUrl,
    rtspUrl,
    settings.dvrIp,
    settings.dvrPort,
    rtspPort,
    channel,
    t,
    timestamp,
    logInfo,
    logWarning,
    logError,
  ]);

  // Closing the screen ends the archive session — the only "disconnect" this
  // app can observe, because playback itself runs in the DVR/external player.
  useEffect(
    () => () => {
      if (sessionClosedRef.current) return;
      sessionClosedRef.current = true;
      logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'جلسهٔ پخش آرشیو بسته شد');
    },
    [logInfo],
  );

  useEffect(() => {
    sendToTv();
  }, [sendToTv]);

  const copyRtsp = useCallback(async () => {
    if (!rtspUrl) return;
    try {
      await Clipboard.setStringAsync(rtspUrl);
      Alert.alert(t('پخش فیلم دوربین'), t('لینک RTSP کپی شد.'));
      logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'لینک RTSP آرشیو کپی شد');
    } catch (error) {
      Alert.alert(t('کپی لینک ممکن نشد'), t('لینک RTSP کپی نشد.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'کپی لینک RTSP ناموفق بود');
    }
  }, [rtspUrl, t, logInfo, logError]);

  const copyCandidate = useCallback(
    async (candidate) => {
      if (!candidate?.url) return;
      try {
        await Clipboard.setStringAsync(candidate.url);
        Alert.alert(t('پخش فیلم دوربین'), t('لینک RTSP کپی شد.'));
        logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'لینک گزینهٔ پخش کپی شد', `گزینه: ${candidate.key}`);
      } catch (error) {
        Alert.alert(t('کپی لینک ممکن نشد'), t('لینک RTSP کپی نشد.'));
        logError(CCTV_LOG_SECTIONS.PLAYBACK, 'کپی لینک گزینهٔ پخش ناموفق بود', `گزینه: ${candidate.key}`);
      }
    },
    [t, logInfo, logError],
  );

  // Hands one RTSP candidate straight to VLC. Used to find, on this firmware,
  // which URL shape plays the archive without a credential prompt.
  const playCandidate = useCallback(
    async (candidate) => {
      if (!candidate?.url) return;
      logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'ارسال گزینهٔ پخش به VLC', `گزینه: ${candidate.key}`);
      if (cctvAvailable) {
        const probe = await probeRtsp(candidate.url);
        if (!probe.ok) {
          const why =
            probe.status === 401 || probe.status === 403
              ? t('این مسیر را دستگاه رد کرد (۴۰۱). رمز دوربین در تنظیمات لازم است.')
              : probe.status === 0
                ? t('دستگاه دوربین در شبکه پاسخ نداد.')
                : t('دستگاه این مسیر آرشیو را نپذیرفت (کد {code}).', { code: probe.status });
          Alert.alert(t('این مسیر پخش نمی‌شود'), why);
          logWarning(
            CCTV_LOG_SECTIONS.PLAYBACK,
            'مسیر آرشیو پخش‌شدنی نبود',
            `گزینه: ${candidate.key} • کد پاسخ: ${probe.status}`,
          );
          return;
        }
      }
      const opened = await openInVlc(candidate.url, { mimeType: 'video/*' });
      if (opened.ok) return;
      Alert.alert(
        t('باز شدن VLC ممکن نشد'),
        opened.reason === 'no-app'
          ? t('هیچ پخش‌کننده‌ای برای این لینک پیدا نشد.')
          : t('پخش‌کننده لینک را نپذیرفت.'),
      );
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'ارسال گزینهٔ پخش به VLC ناموفق بود',
        `گزینه: ${candidate.key} • علت: ${opened.reason || 'unknown'}`,
      );
    },
    [t, logInfo, logWarning],
  );

  const statusIcon =
    tvStatus === 'sent' ? 'checkmark-circle' : tvStatus === 'checking' ? 'hourglass-outline' : 'warning-outline';
  const statusColor =
    tvStatus === 'sent'
      ? colors.green
      : tvStatus === 'error'
        ? colors.red
        : tvStatus === 'notice'
          ? colors.amber
          : colors.primary;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('پخش فیلم دوربین')}
        subtitle={customerName || undefined}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="videocam-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('آرشیو دوربین')}</Text>
          <Text style={styles.heroHint}>
            {t('پخش آرشیو ۵ دقیقه پیش از زمان تراکنش آغاز می‌شود.')}
          </Text>
          {stamp ? (
            <Text style={styles.stamp}>
              {t('زمان تراکنش')}: {stamp.date}
              {stamp.time ? ` • ${stamp.time}` : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name={
                guestStatus === 'done'
                  ? 'checkmark-circle'
                  : guestStatus === 'error'
                    ? 'alert-circle'
                    : 'play-circle-outline'
              }
              size={19}
              color={
                guestStatus === 'done'
                  ? colors.green
                  : guestStatus === 'error'
                    ? colors.red
                    : colors.primary
              }
            />
            <Text style={styles.cardTitle}>{t('پخش آرشیو در VLC (بدون پنجرهٔ رمز)')}</Text>
            {guestStatus === 'running' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
          <Text style={styles.cardHint}>
            {t(
              'اول با پخش مهمان (بدون رمز) امتحان می‌شود؛ اگر دستگاه اجازه ندهد، خودکار از رمز ذخیره‌شده در آدرس استفاده می‌شود — در هر دو حالت هیچ پنجرهٔ رمزی در VLC باز نمی‌شود.',
            )}
          </Text>
          {guestText ? <Text style={styles.cardText}>{guestText}</Text> : null}
          <TouchableOpacity
            style={[styles.primaryBtn, guestStatus === 'running' ? { opacity: 0.6 } : null]}
            onPress={playGuestArchive}
            disabled={guestStatus === 'running' || !candidates.length}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{t('باز کردن آرشیو در VLC')}</Text>
          </TouchableOpacity>
        </View>

        {hasPassword ? (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name={
                playState === 'done'
                  ? 'checkmark-circle'
                  : playState === 'error'
                    ? 'alert-circle'
                    : 'cloud-download-outline'
              }
              size={19}
              color={
                playState === 'done'
                  ? colors.green
                  : playState === 'error'
                    ? colors.red
                    : colors.primary
              }
            />
            <Text style={styles.cardTitle}>{t('دریافت فایل آرشیو و پخش در VLC')}</Text>
            {playState === 'running' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
          {playText ? <Text style={styles.cardText}>{playText}</Text> : null}
          {received && received.bytes > 0 ? (
            <Text style={styles.cardHint}>
              {t('دریافت شده: {mb} مگابایت', {
                mb: (received.bytes / 1048576).toFixed(1),
              })}
              {received.total > 0
                ? ` • ${t('از {mb} مگابایت', {
                    mb: (received.total / 1048576).toFixed(1),
                  })}`
                : ''}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, playState === 'running' ? { opacity: 0.6 } : null]}
            onPress={playClip}
            disabled={playState === 'running'}
            activeOpacity={0.85}
          >
            <Ionicons
              name={playState === 'running' ? 'hourglass-outline' : 'play'}
              size={16}
              color={colors.white}
            />
            <Text style={styles.primaryBtnText}>
              {playState === 'running' ? t('در حال دریافت...') : t('دریافت آرشیو')}
            </Text>
          </TouchableOpacity>
          {playState === 'unavailable' ? (
            <Text style={styles.cardHint}>
              {t(
                'دریافت آرشیو فقط در نسخهٔ نصبی فعال است؛ در Expo Go از گزینه‌های پایین برای باز کردن در VLC استفاده کنید.',
              )}
            </Text>
          ) : null}
        </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name={statusIcon} size={19} color={statusColor} />
            <Text style={[styles.cardTitle, { color: statusColor }]}>
              {tvStatus === 'checking'
                ? t('در حال ارسال دستور پخش...')
                : tvStatus === 'sent'
                  ? t('دستور پخش ارسال شد.')
                  : tvStatus === 'notice'
                    ? t('پخش روی تلویزیون تنظیم نشده است')
                    : t('پخش آزمایشی ناموفق')}
            </Text>
            {tvStatus === 'checking' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {tvText ? <Text style={styles.cardText}>{tvText}</Text> : null}
          {tvStatus !== 'checking' ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={sendToTv} activeOpacity={0.85}>
              <Ionicons name="refresh-outline" size={15} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>{t('ارسال مجدد به تلویزیون')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('گزینه‌های پخش')}</Text>
          <Text style={styles.cardHint}>
            {t('اگر پخش سیاه ماند، گزینهٔ بعدی را امتحان کنید.')}
          </Text>
          {candidates.map((candidate) => (
            <View key={candidate.key} style={styles.candidateRow}>
              <Text style={styles.candidateLabel}>{t(CANDIDATE_LABELS[candidate.key] || candidate.key)}</Text>
              <TouchableOpacity
                style={styles.candidateBtn}
                onPress={() => playCandidate(candidate)}
                activeOpacity={0.85}
              >
                <Ionicons name="play" size={16} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.candidateBtn}
                onPress={() => copyCandidate(candidate)}
                activeOpacity={0.85}
              >
                <Ionicons name="copy-outline" size={16} color={colors.textSoft} />
              </TouchableOpacity>
            </View>
          ))}
          <Text style={styles.cardHint}>
            {t('هر گزینه را می‌توانید مستقیم در VLC باز کنید تا شکل درست آرشیو پیدا شود.')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('لینک RTSP آرشیو')}</Text>
          <View style={styles.urlBox}>
            <Text selectable style={styles.urlText}>
              {maskedUrl || t('لینک RTSP ساخته نشد')}
            </Text>
          </View>
          <Text style={styles.cardHint}>{t('آدرس با پورت ۵۵۴ و بدون نام کاربری و رمز ساخته می‌شود.')}</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={copyRtsp}
              disabled={!rtspUrl}
              activeOpacity={0.85}
            >
              <Ionicons name="copy-outline" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>{t('کپی لینک RTSP')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardHint}>
            {t('اگر دستگاه به مهمان اجازهٔ پخش آرشیو بدهد این لینک بدون هیچ رمزی باز می‌شود.')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 28 },
  heroCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: 18,
    alignItems: 'center',
    ...shadows.card,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 10, ...rtlCenter },
  heroHint: { fontSize: 11.5, color: colors.textSoft, marginTop: 6, lineHeight: 19, ...rtlCenter },
  stamp: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 10, ...rtlCenter },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 15,
    marginTop: 13,
    ...shadows.card,
  },
  cardTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: '800', ...rtl },
  cardText: { fontSize: 11.5, color: colors.textSoft, lineHeight: 19, marginTop: 10, ...rtl },
  cardHint: { fontSize: 10.5, color: colors.muted, lineHeight: 17, marginTop: 8, ...rtl },
  urlBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    marginTop: 10,
  },
  urlText: { fontSize: 10.5, color: colors.text, writingDirection: 'ltr', textAlign: 'left' },
  btnRow: { flexDirection: 'row-reverse', marginTop: 12 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginLeft: 5,
  },
  primaryBtnText: { color: colors.white, fontSize: 12, fontWeight: '800', marginRight: 6, ...rtl },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginRight: 5,
  },
  secondaryBtnText: { color: colors.primary, fontSize: 12, fontWeight: '800', marginRight: 6, ...rtl },
  candidateRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  candidateLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text, ...rtl },
  candidateBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
