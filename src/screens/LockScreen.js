// قفل برنامه — shown at app open when «قفل برنامه» is enabled in Settings.
// Uses the device fingerprint / face / PIN via expo-local-authentication
// (bundled in Expo Go, so it works in both Expo Go and the APK).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LocalAuthentication from 'expo-local-authentication';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';

export default function LockScreen({ onUnlocked }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const authenticatingRef = useRef(false);

  const authenticate = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'ورود به eKhata',
        cancelLabel: 'انصراف',
      });
      if (result && result.success) {
        onUnlocked();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      authenticatingRef.current = false;
      setBusy(false);
    }
  }, [onUnlocked]);

  // Try the fingerprint right away when the lock screen appears.
  useEffect(() => {
    const timer = setTimeout(() => authenticate(), 250);
    return () => clearTimeout(timer);
  }, [authenticate]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.screen}
      >
        <View style={styles.logo}>
          <Ionicons name="lock-closed" size={30} color={colors.white} />
        </View>
        <Text style={styles.title}>eKhata قفل است</Text>
        <Text style={styles.sub}>
          برای ورود، اثر انگشت یا رمز گوشی را وارد کنید.
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={authenticate}
          disabled={busy}
        >
          <Ionicons name="finger-print-outline" size={24} color={colors.white} />
          <Text style={styles.btnText}>{busy ? 'در حال بررسی…' : 'باز کردن'}</Text>
        </TouchableOpacity>

        {failed ? (
          <Text style={styles.failed}>باز نشد — دوباره تلاش کنید.</Text>
        ) : null}

        <Text style={styles.footer}>داده‌های شما فقط روی همین گوشی است.</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDark },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.float,
  },
  title: { fontSize: 21, fontWeight: '800', color: colors.white, marginTop: 20, ...rtlCenter },
  sub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 8,
    lineHeight: 21,
    ...rtlCenter,
  },
  btn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.lg,
    paddingHorizontal: 34,
    paddingVertical: 14,
    marginTop: 28,
  },
  btnText: { fontSize: 15.5, fontWeight: '800', color: colors.white, marginRight: 8 },
  failed: { fontSize: 12.5, color: '#FFD9D9', marginTop: 14, ...rtl },
  footer: {
    position: 'absolute',
    bottom: 24,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    ...rtlCenter,
  },
});
