// In-app update notice.
//
// Checks version.json ONCE per launch (silently — an offline phone or a missing
// file just means no prompt). When the website advertises a NEWER version than
// the one installed, a small card explains it and offers a button that opens the
// app's download page in the browser.
//
// Mounted as a sibling of the navigator in App.js, so its Modal paints above
// every screen (including the lock gate).
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useLang } from '../i18n/LanguageContext';
import { APP_VERSION } from '../buildInfo';
import { fetchUpdateManifest, isNewer } from '../utils/updateCheck';
import { colors, radius, shadows, rtlCenter } from '../theme';

export default function UpdateNotice() {
  const { t } = useLang();
  const [info, setInfo] = useState(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let alive = true;
    (async () => {
      const manifest = await fetchUpdateManifest();
      if (!alive || !manifest) return;
      if (isNewer(manifest.latestVersion, APP_VERSION)) setInfo(manifest);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!info) return null;

  // Prefer the website download PAGE (the owner's rule); fall back to the raw
  // APK URL when the manifest only carries one.
  const target = info.pageUrl || info.downloadUrl;

  const openDownload = async () => {
    try {
      if (target) await Linking.openURL(target);
    } catch (error) {
      // Nothing we can do if the phone has no browser — leave the card open.
      return;
    }
    setInfo(null);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setInfo(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-download-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('بروزرسانی برنامه')}</Text>
          <Text style={styles.body}>
            {t('نسخه جدید برنامه منتشر شده است. لطفاً برای دریافت آخرین امکانات، برنامه را بروزرسانی کنید.')}
          </Text>
          <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={openDownload}>
            <Text style={styles.primaryText}>{t('بروزرسانی')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} activeOpacity={0.7} onPress={() => setInfo(null)}>
            <Text style={styles.secondaryText}>{t('بعداً')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 22,
    alignItems: 'center',
    ...shadows.card,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    ...rtlCenter,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSoft,
    marginBottom: 20,
    ...rtlCenter,
  },
  primary: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  secondary: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
