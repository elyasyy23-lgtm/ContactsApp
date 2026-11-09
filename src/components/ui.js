// Shared presentational pieces for the eKhata-style UI (Persian labels, manual RTL).
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows } from '../theme';

export function IconButton({ name, onPress, size = 20, color = colors.white, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.iconButton, style]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

/** Purple gradient header used on every screen (stack headers are hidden). */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  left,
  children,
  bottomRadius = true,
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.header,
        { paddingTop: insets.top + 10 },
        bottomRadius && styles.headerRadius,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          {onBack ? (
            <IconButton name="chevron-back" onPress={onBack} size={24} />
          ) : left ? (
            left
          ) : null}
        </View>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={[styles.headerSide, styles.headerSideRight]}>{right}</View>
      </View>
      {children}
    </LinearGradient>
  );
}

export function Avatar({ letter, size = 46, tone = 'purple' }) {
  const palette = {
    purple: { bg: colors.primarySoft, fg: colors.primary },
    green: { bg: colors.greenSoft, fg: colors.greenDark },
    red: { bg: colors.redSoft, fg: colors.redDark },
  }[tone];
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
      ]}
    >
      <Text style={{ fontSize: size * 0.42, fontWeight: '800', color: palette.fg }}>
        {letter}
      </Text>
    </View>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function EmptyState({ icon = 'people-outline', title, hint }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.primaryLight} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function ActionButton({ label, icon, tone = 'green', onPress, disabled }) {
  const palette =
    tone === 'green'
      ? { bg: colors.green, fg: colors.white }
      : tone === 'red'
        ? { bg: colors.red, fg: colors.white }
        : { bg: colors.primary, fg: colors.white };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, { backgroundColor: palette.bg }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={18} color={palette.fg} />
      </View>
      <Text style={[styles.actionLabel, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 22,
  },
  headerRadius: {
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  headerSide: { width: 56, alignItems: 'flex-start' },
  headerSideRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  avatar: { alignItems: 'center', justifyContent: 'center' },

  chip: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13.5, fontWeight: '700', color: colors.textSoft },
  chipTextActive: { color: colors.white },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyIcon: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyHint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 21,
    textAlign: 'center',
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },

  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  actionLabel: { fontSize: 14.5, fontWeight: '800' },
});
