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
  buildLiveCandidates,
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
  probeGuest,
  probeRtsp,
  stopArchive,
  streamArchive,
} from '../../modules/cctv-playback';
import { openInVlc, openLocalFileInVlc } from '../utils/vlc';

/**
 * CCTV archive screen. VLC is the video player.
 *
 * Owner rule: archive playback must show the RECORDED window, not the live feed.
 *
 * 1. PRIMARY (guaranteed): the `cctv-playback` module logs in over DVRIP on port
 *    34567, asks the device which files cover the requested window, downloads
 *    exactly that range and VLC opens a LOCAL file. This is the only path that
 *    cannot degrade to live video, because the DVR is explicitly asked for
 *    archived files. It needs the camera password stored in Settings.
 * 2. Advanced/experimental: RTSP archive URLs (port 554). Measured on this
 *    Xiongmai firmware: the RTSP server answers 2xx and then streams the LIVE
 *    picture while ignoring `starttime`/`endtime`, so these shapes can never be
 *    the primary action — they are kept only for a different firmware/model.
 * 3. Expo Go has no DVRIP socket, so the native path reports "not available"
 *    and the screen says so plainly instead of pretending.
 */
const CANDIDATE_LABELS = {
  'archive-guest-xm': 'آرشیو • بدون رمز (مسیر اصلی دستگاه)',
  'archive-guest-xm-tz': 'آرشیو • بدون رمز (زمان UTC)',
  'archive-guest-xm-bare': 'آرشیو • بدون هیچ پارامتر ورود',
  'archive-guest-dahua-playback': 'آرشیو • مسیر playback دستگاه',
  'archive-guest-dahua-playback-utc': 'آرشیو • مسیر playback (زمان UTC)',
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

  // Live URLs live in a SEPARATE list: they are a reachability check only, so
  // the one-tap archive button can never fall back to the live feed.
  const liveCandidates = useMemo(
    () =>
      buildLiveCandidates({
        ip: settings.dvrIp,
        rtspPort,
        user: settings.dvrUser,
        pass: settings.dvrPassword,
        channel,
      }),
    [settings.dvrIp, rtspPort, settings.dvrUser, settings.dvrPassword, channel],
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

  // ── PRIMARY path: native DVRIP archive (streaming first, then file) ────────
  const [playState, setPlayState] = useState('idle');
  const [playText, setPlayText] = useState('');
  const [received, setReceived] = useState(null);
  const [stage, setStage] = useState('');
  const [speed, setSpeed] = useState(0);
  const [frames, setFrames] = useState(null);
  const [subStream, setSubStream] = useState(true);
  const [lanUrl, setLanUrl] = useState('');

  const nativeReady = cctvAvailable && hasPassword;

  // Byte-count samples for the speed readout. DVRIP delivers hundreds of small
  // packets per second, so the number is recomputed at most every 500 ms rather
  // than on every packet (a setState per packet would starve the UI thread).
  const sampleRef = useRef({ bytes: 0, at: 0, lastAt: 0 });

  useEffect(() => {
    const subscription = addCctvListener((event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'progress') {
        const bytes = Number(event.bytes) || 0;
        const total = Number(event.total) || 0;
        setReceived({ bytes, total: Math.max(total, bytes) });
        setFrames({
          done: Number(event.frames) || 0,
          total: Number(event.framesTotal) || 0,
        });
        const now = Date.now();
        const sample = sampleRef.current;
        if (!sample.at) {
          sample.at = now;
          sample.bytes = bytes;
          return;
        }
        const elapsed = now - sample.at;
        if (elapsed < 500) return;
        const rate = ((bytes - sample.bytes) * 1000) / elapsed;
        sample.at = now;
        sample.bytes = bytes;
        setSpeed(rate > 0 ? rate : 0);
        return;
      }
      if (event.type === 'stage') {
        const map = {
          connecting: t('اتصال به دستگاه...'),
          login: t('ورود به دستگاه...'),
          query: t('جستجوی ضبط همان بازه...'),
          download: t('دریافت تصویر ضبط‌شده...'),
          downloaded: t('دریافت کامل شد.'),
          streaming: t('در حال پخش هم‌زمان با دریافت...'),
          streamed: t('ارسال آرشیو کامل شد.'),
        };
        setStage(map[event.stage] || '');
        return;
      }
      if (event.type === 'error') {
        setReceived(null);
        setFrames(null);
        setSpeed(0);
        // After the URL was handed to VLC a failure can only arrive as this
        // event, so it has to be visible instead of silently freezing.
        if (!event.cancelled) {
          setPlayState('error');
          setPlayText(event.message ? `${t('خطا')}: ${event.message}` : t('استریم قطع شد.'));
        }
        return;
      }
    });
    return () => subscription.remove();
  }, [t]);

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
    if (!hasPassword) {
      setPlayState('error');
      setPlayText(
        t(
          'برای پخش تضمینی آرشیو، رمز دوربین را در تنظیمات وارد کنید. بدون رمز، دستگاه فقط تصویر زنده می‌دهد.',
        ),
      );
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'پخش آرشیو آغاز نشد',
        'رمز دوربین ذخیره نشده است.',
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
      const played = await openLocalFileInVlc(result.path, {
        mimeType: result.mime || 'video/mp2t',
      });
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
    const detail = result?.message ? ` — ${result.message}` : '';
    setPlayText(
      t('دریافت آرشیو ناموفق بود ({reason}{detail}). پورت DVRIP فعلی: {port}', {
        reason,
        detail,
        port,
      }),
    );
    logError(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'دریافت آرشیو ناموفق بود',
      `علت: ${reason} • پورت DVRIP: ${port}`,
    );
  }, [
    channel,
    hasPassword,
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


  // Streams instead of waiting for a full download: the DVRIP window is pushed
  // into a loopback HTTP server packet by packet and VLC starts on the first
  // frames, so the picture appears in seconds (the XMEye behaviour) instead of
  // after a 40 MB transfer.
  const streamClip = useCallback(async () => {
    if (!cctvAvailable) {
      setPlayState('unavailable');
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'استریم آرشیو در دسترس نیست',
        'ماژول بومی در Expo Go وجود ندارد؛ فقط در نسخهٔ نصبی فعال است.',
      );
      return;
    }
    if (!hasPassword) {
      setPlayState('error');
      setPlayText(
        t(
          'برای پخش آرشیو، رمز دوربین را در تنظیمات وارد کنید. بدون رمز، دستگاه فقط تصویر زنده می‌دهد.',
        ),
      );
      logWarning(CCTV_LOG_SECTIONS.PLAYBACK, 'استریم آرشیو آغاز نشد', 'رمز دوربین ذخیره نشده است.');
      return;
    }
    const when = transactionTimestamp(timestamp);
    if (!when) {
      setPlayState('error');
      setPlayText(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'استریم آرشیو آغاز نشد', 'زمان تراکنش معتبر نیست.');
      return;
    }
    const window = archiveWindow({ timestamp: when });
    if (!window) {
      setPlayState('error');
      setPlayText(t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(CCTV_LOG_SECTIONS.PLAYBACK, 'استریم آرشیو آغاز نشد', 'بازهٔ زمانی ساخته نشد.');
      return;
    }
    const port = Number(dvripPortOf(settings));
    sampleRef.current = { bytes: 0, at: 0, lastAt: 0 };
    setPlayState('running');
    setReceived(null);
    setFrames(null);
    setSpeed(0);
    setPlayText(t('در حال آماده‌سازی استریم آرشیو...'));
    logInfo(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'استریم آرشیو از دستگاه آغاز شد',
      `پورت DVRIP: ${port} • کانال ${channel} • ${window.startTime} تا ${window.endTime} • ${
        subStream ? 'استریم سبک' : 'استریم کامل'
      }`,
    );
    const result = await streamArchive({
      ip: settings.dvrIp,
      port,
      user: settings.dvrUser,
      password: settings.dvrPassword,
      channel,
      streamType: subStream ? 1 : 0,
      startMs: window.start,
      endMs: window.end,
    });
    if (result?.ok && result.url) {
      setLanUrl(result.lanUrl || '');
      const opened = await openInVlc(result.url, { mimeType: result.mime || 'video/mp2t' });
      if (opened.ok) {
        setPlayState('running');
        setPlayText(t('پخش آغاز شد؛ ادامهٔ تصویر هم‌زمان از دستگاه دریافت می‌شود.'));
        logInfo(
          CCTV_LOG_SECTIONS.PLAYBACK,
          'استریم آرشیو به VLC سپرده شد',
          `${result.file || ''} • ${subStream ? 'استریم سبک' : 'استریم کامل'}`,
        );
        return;
      }
      await stopArchive();
      setPlayState('error');
      setPlayText(t('استریم آماده شد ولی باز شدن VLC ممکن نشد.'));
      logWarning(
        CCTV_LOG_SECTIONS.PLAYBACK,
        'باز شدن VLC برای استریم ممکن نشد',
        `علت: ${opened.reason || 'unknown'}`,
      );
      return;
    }
    const reason = result?.reason || 'unknown';
    setPlayState('error');
    const detail = result?.message ? ` — ${result.message}` : '';
    setPlayText(
      t('استریم آرشیو ناموفق بود ({reason}{detail}). پورت DVRIP فعلی: {port}', {
        reason,
        detail,
        port,
      }),
    );
    logError(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'استریم آرشیو ناموفق بود',
      `علت: ${reason} • پورت DVRIP: ${port}`,
    );
  }, [
    channel,
    hasPassword,
    settings.dvrIp,
    settings.dvrPort,
    settings.dvrUser,
    settings.dvrPassword,
    subStream,
    t,
    timestamp,
    logInfo,
    logWarning,
    logError,
  ]);

  const copyLan = useCallback(async () => {
    if (!lanUrl) return;
    try {
      await Clipboard.setStringAsync(lanUrl);
      logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'نشانی استریم برای تلویزیون کپی شد');
    } catch (error) {
      logWarning(CCTV_LOG_SECTIONS.PLAYBACK, 'کپی نشانی استریم ناموفق بود');
    }
  }, [lanUrl, logInfo, logWarning]);

  const cancelClip = useCallback(async () => {
    await stopArchive();
    setLanUrl('');
    setPlayState('idle');
    setPlayText(t('دریافت لغو شد.'));
    setReceived(null);
    setFrames(null);
    setSpeed(0);
    setStage('');
    sampleRef.current = { bytes: 0, at: 0, lastAt: 0 };
    logWarning(CCTV_LOG_SECTIONS.PLAYBACK, 'دریافت آرشیو لغو شد');
  }, [t, logWarning]);

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

  // Opening this screen IS the user's tap on the camera icon, so the archive
  // starts by itself when the device path is usable — streaming first, because
  // waiting for the whole clip is the complaint this path exists to fix.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!nativeReady) {
      sendToTv();
      return;
    }
    autoStartedRef.current = true;
    streamClip();
  }, [nativeReady, streamClip, sendToTv]);

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

  // Guest/anonymous check. Playback without a password can only be enabled ON
  // the recorder (DVRIP has no account-write call), so the honest thing is to
  // measure what this device currently allows and then name the console menu.
  const [guestProbe, setGuestProbe] = useState({ state: 'idle', text: '' });

  const runGuestProbe = useCallback(async () => {
    if (!cctvAvailable) {
      setGuestProbe({
        state: 'unavailable',
        text: t('این آزمایش فقط در نسخهٔ نصبی برنامه امکان‌پذیر است.'),
      });
      return;
    }
    const port = Number(dvripPortOf(settings));
    setGuestProbe({ state: 'running', text: t('در حال آزمایش حساب مهمان دستگاه...') });
    const when = transactionTimestamp(timestamp);
    const result = await probeGuest({
      ip: settings.dvrIp,
      port,
      user: settings.dvrUser,
      password: settings.dvrPassword,
      channel,
      startMs: when ? new Date(when).getTime() : Date.now(),
    });
    if (result?.guestUsable) {
      setGuestProbe({
        state: 'usable',
        text: t(
          'این دستگاه پخش بدون رمز را می‌پذیرد؛ آرشیو با لینک مهمان هم باز می‌شود. برای امنیت، رمز را در تنظیمات نگه دارید.',
        ),
      });
      logInfo(CCTV_LOG_SECTIONS.PLAYBACK, 'دستگاه پخش مهمان را می‌پذیرد', `پورت DVRIP: ${port}`);
      return;
    }
    setGuestProbe({
      state: 'blocked',
      text: t(
        'این دستگاه پخش بدون رمز را نمی‌پذیرد و از برنامه هم قابل روشن‌کردن نیست. برای فعال‌کردن، روی خود دستگاه: منوی اصلی ← تنظیمات ← حساب‌ها/کاربران ← کاربر مهمان (Guest) را روشن کنید و رمز آن را خالی بگذارید؛ اگر گزینهٔ RTSP ← «دسترسی بدون احراز هویت» وجود داشت آن را هم روشن کنید. سپس همین آزمایش را تکرار کنید.',
      ),
    });
    logWarning(
      CCTV_LOG_SECTIONS.PLAYBACK,
      'دستگاه پخش مهمان را نمی‌پذیرد',
      'فعال‌سازی فقط از منوی خود دستگاه ممکن است.',
    );
  }, [channel, cctvAvailable, settings.dvrIp, settings.dvrPort, settings.dvrUser, settings.dvrPassword, t, timestamp, logInfo, logWarning]);

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

        {/* PRIMARY: recorded footage straight from the DVR over DVRIP. This is
            the only path that cannot fall back to the live stream. */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name={
                playState === 'done'
                  ? 'checkmark-circle'
                  : playState === 'error'
                    ? 'alert-circle'
                    : 'film-outline'
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
            <Text style={styles.cardTitle}>{t('پخش آرشیو ضبط‌شده (تضمینی)')}</Text>
            {playState === 'running' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
          <Text style={styles.cardHint}>
            {t(
              'تصویر ضبط‌شدهٔ همان بازه (۵ دقیقه قبل تا ۵ دقیقه بعد از تراکنش) مستقیماً از دستگاه گرفته و پخش می‌شود؛ پخش زنده هرگز جای آن را نمی‌گیرد.',
            )}
          </Text>
          {stage && playState === 'running' ? (
            <Text style={styles.cardHint}>{stage}</Text>
          ) : null}
          {playText ? <Text style={styles.cardText}>{playText}</Text> : null}
          {received && received.bytes > 0 ? (
            <Text style={styles.cardHint}>
              {t('دریافت شده: {mb} مگابایت', {
                mb: (received.bytes / 1048576).toFixed(1),
              })}
              {speed > 0
                ? ` • ${t('سرعت')}: ${(speed / 1048576).toFixed(2)} ${t('مگابایت بر ثانیه')}`
                : ''}
              {frames && frames.done > 0
                ? ` • ${t('فریم')}: ${frames.done}${frames.total ? ` / ${frames.total}` : ''}`
                : ''}
            </Text>
          ) : null}

          {!cctvAvailable ? (
            <Text style={styles.cardHint}>
              {t(
                'دریافت آرشیو از دستگاه فقط در نسخهٔ نصبی فعال است؛ در Expo Go امکان اتصال به دستگاه وجود ندارد.',
              )}
            </Text>
          ) : !hasPassword ? (
            <Text style={styles.cardHint}>
              {t(
                'برای پخش تضمینی آرشیو، رمز دوربین را در تنظیمات وارد کنید. بدون رمز، دستگاه فقط تصویر زنده می‌دهد.',
              )}
            </Text>
          ) : (
            <View style={styles.qualityRow}>
              <TouchableOpacity
                style={[styles.qualityChip, subStream ? styles.qualityChipOn : null]}
                onPress={() => setSubStream(true)}
                activeOpacity={0.85}
                disabled={playState === 'running'}
              >
                <Text style={[styles.qualityChipText, subStream ? styles.qualityChipTextOn : null]}>
                  {t('سبک (شروع سریع)')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qualityChip, !subStream ? styles.qualityChipOn : null]}
                onPress={() => setSubStream(false)}
                activeOpacity={0.85}
                disabled={playState === 'running'}
              >
                <Text style={[styles.qualityChipText, !subStream ? styles.qualityChipTextOn : null]}>
                  {t('کامل (کیفیت اصلی)')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, playState === 'running' ? { opacity: 0.6 } : null]}
              onPress={streamClip}
              disabled={playState === 'running' || !nativeReady}
              activeOpacity={0.85}
            >
              <Ionicons
                name={playState === 'running' ? 'hourglass-outline' : 'play'}
                size={16}
                color={colors.white}
              />
              <Text style={styles.primaryBtnText}>
                {playState === 'running' ? t('در حال استریم...') : t('پخش آرشیو ضبط‌شده')}
              </Text>
            </TouchableOpacity>
            {playState === 'running' ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={cancelClip} activeOpacity={0.85}>
                <Ionicons name="stop-circle-outline" size={15} color={colors.red} />
                <Text style={styles.secondaryBtnText}>{t('لغو')}</Text>
              </TouchableOpacity>
            ) : nativeReady ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={playClip} activeOpacity={0.85}>
                <Ionicons name="download-outline" size={15} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>{t('دانلود کامل و پخش')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {lanUrl ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="tv-outline" size={19} color={colors.primary} />
              <Text style={styles.cardTitle}>{t('پخش روی تلویزیون از طریق شبکه')}</Text>
            </View>
            <Text style={styles.cardHint}>
              {t(
                'این نشانی تا وقتی این صفحه باز است زنده می‌ماند. در تلویزیون، ویدیو را از نشانی شبکه باز کنید:',
              )}
            </Text>
            <Text selectable style={styles.tvUrl}>
              {lanUrl}
            </Text>
            <Text style={styles.cardHint}>
              {t(
                'گام‌ها: ۱) تلویزیون و گوشی روی یک وای‌فای باشند. ۲) در تلویزیون گزینهٔ «ورود نشانی» یا «DLNA/شبکه» را بزنید. ۳) همین نشانی را وارد کنید و پخش را آغاز کنید.',
              )}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={copyLan} activeOpacity={0.85}>
                <Ionicons name="copy-outline" size={15} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>{t('کپی نشانی')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => openInVlc(lanUrl, { mimeType: 'video/mp2t' })}
                activeOpacity={0.85}
              >
                <Ionicons name="open-outline" size={15} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>{t('آزمایش همین نشانی')}</Text>
              </TouchableOpacity>
            </View>
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
          <Text style={styles.cardTitle}>{t('گزینه‌های پیشرفتهٔ RTSP')}</Text>
          <Text style={styles.cardHint}>
            {t(
              'این مسیرها فقط برای دستگاه‌هایی است که آرشیو را روی RTSP می‌دهند. روی این دستگاه اندازه‌گیری شد که همین درخواست‌ها تصویر زنده پخش می‌کنند، پس از دکمهٔ تضمینی بالا استفاده کنید.',
            )}
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
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={playGuestArchive}
            disabled={guestStatus === 'running' || !candidates.length}
            activeOpacity={0.85}
          >
            <Ionicons name="flash-outline" size={15} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>
              {guestStatus === 'running'
                ? t('در حال بررسی مسیرها...')
                : t('امتحان خودکار مسیرهای RTSP')}
            </Text>
          </TouchableOpacity>
          {guestText ? <Text style={styles.cardText}>{guestText}</Text> : null}
          {liveCandidates.length ? (
            <Text style={styles.cardHint}>
              {t('برای مقایسه با تصویر زنده (تشخیص مشکل شبکه) از دکمهٔ «تست پخش زنده» استفاده کنید.')}
            </Text>
          ) : null}
          {liveCandidates.length ? (
            <View style={styles.candidateRow}>
              <Text style={styles.candidateLabel}>{t('تست پخش زنده (بدون آرشیو)')}</Text>
              <TouchableOpacity
                style={styles.candidateBtn}
                onPress={() => playCandidate(liveCandidates[0])}
                activeOpacity={0.85}
              >
                <Ionicons name="radio-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : null}
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('پخش بدون رمز (حساب مهمان)')}</Text>
          <Text style={styles.cardHint}>
            {t(
              'این آزمایش فقط می‌خواند و چیزی روی دستگاه تغییر نمی‌دهد؛ اگر دستگاه اجازه بدهد، پخش بدون رمز هم ممکن می‌شود.',
            )}
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={runGuestProbe}
              disabled={guestProbe.state === 'running'}
              activeOpacity={0.85}
            >
              <Ionicons name="person-circle-outline" size={15} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>
                {guestProbe.state === 'running' ? t('در حال آزمایش...') : t('آزمایش دسترسی مهمان')}
              </Text>
            </TouchableOpacity>
          </View>
          {guestProbe.text ? <Text style={styles.cardText}>{guestProbe.text}</Text> : null}
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
  tvUrl: {
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.primary,
    textAlign: 'left',
    writingDirection: 'ltr',
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
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
  qualityRow: { flexDirection: 'row-reverse', marginTop: 10 },
  qualityChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 11,
    marginLeft: 6,
  },
  qualityChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  qualityChipText: { fontSize: 10.5, color: colors.muted, fontWeight: '700', ...rtl },
  qualityChipTextOn: { color: colors.primary },
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
