import React, { useCallback, useMemo, useState } from 'react';
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
import { EmptyState, ScreenHeader } from '../components/ui';
import { dateTime, digits } from '../utils/format';
import {
  CCTV_LOG_SECTIONS,
  filterLogs,
  formatLogsForCopy,
  LOG_FILTER_ALL,
  LOG_LEVELS,
} from '../utils/diagnostics';
import {
  useCctvDiagnostics,
  useCctvDiagnosticsActions,
} from '../store/DiagnosticsContext';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

/**
 * Local, read-only view for CCTV/DVR diagnostics.
 * Entries are already sanitized by the diagnostics helpers; this screen only
 * renders, filters, copies and clears them. No native camera/RTSP code lives here.
 */
export default function CctvDiagnosticsScreen({ navigation }) {
  useLang(); // re-render when the app language changes
  const { logs, hydrated } = useCctvDiagnostics();
  const { clearLogs } = useCctvDiagnosticsActions();
  const [levelFilter, setLevelFilter] = useState(LOG_FILTER_ALL);

  const visibleLogs = useMemo(
    () => filterLogs(logs, { level: levelFilter }),
    [logs, levelFilter],
  );
  const errorLogs = useMemo(
    () => logs.filter((item) => item.level === LOG_LEVELS.ERROR),
    [logs],
  );

  const copyText = useCallback(async (text, successMessage) => {
    if (!text) {
      Alert.alert(t('کپی لاگ‌ها'), t('موردی برای کپی وجود ندارد.'));
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert(t('کپی لاگ‌ها'), t(successMessage));
    } catch (error) {
      Alert.alert(t('کپی لاگ‌ها'), t('لاگ‌ها کپی نشدند.'));
    }
  }, []);

  const copyAll = useCallback(() => {
    copyText(formatLogsForCopy(logs), 'همه لاگ‌ها کپی شدند.');
  }, [copyText, logs]);

  const copyErrors = useCallback(() => {
    copyText(formatLogsForCopy(errorLogs), 'خطاها کپی شدند.');
  }, [copyText, errorLogs]);

  const confirmClear = useCallback(() => {
    if (!logs.length) return;
    Alert.alert(
      t('پاک کردن لاگ‌ها'),
      t('همه لاگ‌های دوربین پاک می‌شوند. ادامه میدهید؟'),
      [
        { text: t('لغو'), style: 'cancel' },
        { text: t('پاک کردن لاگ‌ها'), style: 'destructive', onPress: clearLogs },
      ],
    );
  }, [clearLogs, logs.length]);

  const filters = useMemo(
    () => [
      { key: LOG_FILTER_ALL, label: t('همه') },
      { key: LOG_LEVELS.INFO, label: t('اطلاعات') },
      { key: LOG_LEVELS.WARNING, label: t('هشدار') },
      { key: LOG_LEVELS.ERROR, label: t('خطا') },
    ],
    [],
  );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('گزارش و عیب‌یابی دوربین')}
        subtitle={t('لاگ محلی دوربین')}
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.countPill}>
            <Text style={styles.countText}>{digits(logs.length)}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="document-text-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.summaryBody}>
            <Text style={styles.summaryTitle}>{t('خلاصه گزارش')}</Text>
            <Text style={styles.summaryLine}>
              {t('کل رویدادها')}: {digits(logs.length)}
            </Text>
            <Text style={[styles.summaryLine, errorLogs.length ? styles.errorText : null]}>
              {t('خطاها')}: {digits(errorLogs.length)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('فیلتر میزان اهمیت')}</Text>
          <View style={styles.filterRow}>
            {filters.map((item) => {
              const active = levelFilter === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.85}
                  onPress={() => setLevelFilter(item.key)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.copyBtn]}
            activeOpacity={0.85}
            onPress={copyAll}
            disabled={!logs.length}
          >
            <Ionicons name="copy-outline" size={16} color={colors.white} />
            <Text style={styles.actionText}>{t('کپی همه لاگ‌ها')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.errorBtn]}
            activeOpacity={0.85}
            onPress={copyErrors}
            disabled={!errorLogs.length}
          >
            <Ionicons name="warning-outline" size={16} color={colors.white} />
            <Text style={styles.actionText}>{t('کپی خطاها')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, styles.clearBtn]}
          activeOpacity={0.85}
          onPress={confirmClear}
          disabled={!logs.length}
        >
          <Ionicons name="trash-outline" size={16} color={colors.white} />
          <Text style={styles.actionText}>{t('پاک کردن لاگ‌ها')}</Text>
        </TouchableOpacity>

        {!hydrated ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>{t('در حال خواندن لاگ‌ها...')}</Text>
          </View>
        ) : visibleLogs.length ? (
          <View style={styles.list}>
            {visibleLogs.map((item) => {
              const stamp = dateTime(item.at);
              const level = levelStyle(item.level);
              const section = sectionLabel(item.section);
              return (
                <View
                  key={item.id}
                  style={[styles.logCard, item.level === LOG_LEVELS.ERROR && styles.logCardError]}
                >
                  <View style={styles.logTopRow}>
                    <View style={[styles.levelBadge, { backgroundColor: level.bg }]}>
                      <Ionicons name={level.icon} size={14} color={level.fg} />
                      <Text style={[styles.levelText, { color: level.fg }]}>{level.label}</Text>
                    </View>
                    <Text style={styles.logTime}>
                      {stamp.date}
                      {stamp.time ? `  ${stamp.time}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.logMessage} numberOfLines={4}>
                    {item.message}
                  </Text>
                  {item.detail ? (
                    <Text style={styles.logDetail} numberOfLines={3}>
                      {item.detail}
                    </Text>
                  ) : null}
                  <Text style={styles.logSection}>{section}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon={logs.length ? 'filter-outline' : 'document-text-outline'}
            title={logs.length ? t('رویدادی با این فیلتر نیست') : t('هنوز لاگی وجود ندارد')}
            hint={
              logs.length
                ? t('فیلتر میزان اهمیت را تغییر بدهید.')
                : t('پس از انجام کارهای دوربین، رویدادها در اینجا نمایش داده میشوند.')
            }
          />
        )}

        <Text style={styles.footerNote}>
          {t('لاگ‌ها فقط روی دستگاه ذخیره میشوند و اطلاعات حساس در آنها قرار نمیگیرد.')}
        </Text>
      </ScrollView>
    </View>
  );
}

function levelStyle(level) {
  if (level === LOG_LEVELS.ERROR) {
    return { bg: colors.redSoft, fg: colors.redDark, icon: 'alert-circle-outline', label: t('خطا') };
  }
  if (level === LOG_LEVELS.WARNING) {
    return { bg: colors.amberSoft, fg: colors.amber, icon: 'warning-outline', label: t('هشدار') };
  }
  return {
    bg: colors.greenSoft,
    fg: colors.greenDark,
    icon: 'information-circle-outline',
    label: t('اطلاعات'),
  };
}

function sectionLabel(section) {
  if (section === CCTV_LOG_SECTIONS.SETTINGS) return t('تنظیمات دوربین');
  if (section === CCTV_LOG_SECTIONS.PLAYBACK) return t('پخش آرشیو');
  return t('دوربین');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 30 },
  countPill: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  countText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  summaryCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: 16,
    ...shadows.card,
  },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBody: { flex: 1, marginRight: 12 },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: colors.text, ...rtl },
  summaryLine: { fontSize: 12, color: colors.textSoft, marginTop: 5, ...rtl },
  errorText: { color: colors.redDark, fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 13,
    ...shadows.card,
  },
  cardTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginBottom: 10, ...rtl },
  filterRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start' },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 7,
    marginBottom: 7,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textSoft, ...rtl },
  filterTextActive: { color: colors.white },
  actionRow: { flexDirection: 'row-reverse', marginTop: 13 },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  copyBtn: { backgroundColor: colors.primary, marginLeft: 6 },
  errorBtn: { backgroundColor: colors.red, marginRight: 6 },
  clearBtn: { backgroundColor: colors.amber, marginTop: 9 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '800', marginRight: 7, ...rtl },
  list: { marginTop: 15 },
  logCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: 10,
    ...shadows.card,
  },
  logCardError: { borderColor: colors.red, backgroundColor: colors.redSoft },
  logTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  levelBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  levelText: { fontSize: 10.5, fontWeight: '800', marginRight: 5, ...rtl },
  logTime: { fontSize: 10.5, color: colors.muted, writingDirection: 'rtl' },
  logMessage: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 10, lineHeight: 20, ...rtl },
  logDetail: { fontSize: 11, color: colors.textSoft, marginTop: 5, lineHeight: 18, ...rtl },
  logSection: { fontSize: 10, color: colors.muted, marginTop: 7, ...rtl },
  loadingBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  loadingText: { fontSize: 12, color: colors.textSoft, marginRight: 9, ...rtl },
  footerNote: {
    fontSize: 10.5,
    color: colors.muted,
    lineHeight: 17,
    marginTop: 14,
    ...rtlCenter,
  },
});
