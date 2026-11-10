// گزارش همه مشتریان — one row per customer with credit / payment / net
// balance, a totals footer, and a share button that exports the CSV file.
import React, { useMemo } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, shadows } from '../theme';
import { money, toFa } from '../utils/format';
import { sortContacts, useContacts } from '../store/ContactsContext';
import { useProfiles } from '../store/ProfilesContext';
import { Avatar, EmptyState, IconButton, ScreenHeader } from '../components/ui';
import { exportCsv } from '../utils/exports';

export default function ReportScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const { profiles } = useProfiles();

  const rows = useMemo(() => {
    const sorted = sortContacts(contacts);
    return sorted.map((c) => {
      let credited = 0;
      let paid = 0;
      (c.transactions || []).forEach((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'credit') credited += amount;
        else paid += amount;
      });
      const net = credited - paid;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        letter: c.letter,
        credited,
        paid,
        net,
      };
    });
  }, [contacts]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.credited += r.credited;
          acc.paid += r.paid;
          if (r.net > 0) acc.receivable += r.net;
          else if (r.net < 0) acc.payable += Math.abs(r.net);
          return acc;
        },
        { credited: 0, paid: 0, receivable: 0, payable: 0 },
      ),
    [rows],
  );

  const share = async () => {
    const result = await exportCsv({ contacts, profiles });
    if (!result.ok) {
      Alert.alert('خروجی ناموفق', 'ساخت فایل CSV ممکن نشد. دوباره تلاش کنید.');
    }
  };

  const renderItem = ({ item }) => {
    const netColor = item.net > 0 ? colors.red : item.net < 0 ? colors.green : colors.muted;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => navigation.navigate('CustomerDetail', { contactId: item.id })}
      >
        <View style={styles.cardTop}>
          <Avatar letter={item.letter} tone={item.net > 0 ? 'red' : 'purple'} size={40} />
          <View style={styles.cardMain}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.phone} numberOfLines={1}>
              {item.phone ? toFa(item.phone) : 'بدون شماره تلفن'}
            </Text>
          </View>
          <View style={styles.netCol}>
            <Text style={[styles.net, { color: netColor }]} numberOfLines={1}>
              {money(item.net)}
            </Text>
            <Text style={[styles.netLabel, { color: netColor }]}>مانده</Text>
          </View>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>کل بدهی</Text>
            <Text style={[styles.statValue, { color: colors.red }]}>{money(item.credited)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>کل دریافت</Text>
            <Text style={[styles.statValue, { color: colors.green }]}>
              {money(item.paid)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="گزارش همه مشتریان"
        subtitle={`${toFa(rows.length)} مشتری`}
        onBack={() => navigation.goBack()}
        right={<IconButton name="share-outline" onPress={share} />}
      />

      <View style={styles.totalsCard}>
        <View style={styles.totalsRow}>
          <View style={styles.totalsItem}>
            <Text style={styles.totalsLabel}>طلب از مشتریان</Text>
            <Text style={[styles.totalsValue, { color: colors.red }]}>
              {money(totals.receivable)}
            </Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsItem}>
            <Text style={styles.totalsLabel}>بدهی به مشتریان</Text>
            <Text style={[styles.totalsValue, { color: colors.green }]}>
              {money(totals.payable)}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="هنوز مشتری‌ای ثبت نشده"
            hint="اولین مشتری را از صفحه اصلی اضافه کنید."
          />
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={styles.footerCard}>
              <Text style={styles.footerTitle}>جمع کل همه مشتریان</Text>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>کل بدهی ثبت‌شده</Text>
                <Text style={[styles.footerValue, { color: colors.red }]}>
                  {money(totals.credited)}
                </Text>
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>کل دریافت‌شده</Text>
                <Text style={[styles.footerValue, { color: colors.green }]}>
                  {money(totals.paid)}
                </Text>
              </View>
              <View style={[styles.footerRow, styles.footerRowLast]}>
                <Text style={styles.footerLabelBold}>مانده کل</Text>
                <Text style={[styles.footerValueBold, { color: colors.primary }]}>
                  {money(totals.credited - totals.paid)}
                </Text>
              </View>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  totalsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingTop: 14,
    paddingBottom: 14,
    ...shadows.hero,
  },
  totalsRow: { flexDirection: 'row', alignItems: 'center' },
  totalsItem: { flex: 1, alignItems: 'center' },
  totalsLabel: {
    fontSize: 11,
    color: colors.textSoft,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  totalsValue: { fontSize: 18, fontWeight: '800', marginTop: 5 },
  totalsDivider: { width: 1, height: 40, backgroundColor: colors.border },

  listContent: { padding: 16, paddingTop: 14 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 10,
    ...shadows.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardMain: { flex: 1, marginLeft: 10 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  phone: { fontSize: 11.5, color: colors.muted, marginTop: 3, textAlign: 'right', writingDirection: 'rtl' },
  netCol: { alignItems: 'flex-end', minWidth: 78 },
  net: { fontSize: 14.5, fontWeight: '800' },
  netLabel: { fontSize: 10, fontWeight: '700', marginTop: 2, ...rtl },

  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10.5, color: colors.muted, ...rtl },
  statValue: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  statDivider: { width: 1, height: 26, backgroundColor: colors.border },

  footerCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 6,
  },
  footerTitle: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: 8, ...rtl },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  footerRowLast: { borderTopWidth: 1, borderTopColor: 'rgba(108,59,209,0.18)', marginTop: 4, paddingTop: 9 },
  footerLabel: { fontSize: 12, color: colors.textSoft, ...rtl },
  footerLabelBold: { fontSize: 12.5, fontWeight: '800', color: colors.text, ...rtl },
  footerValue: { fontSize: 12.5, fontWeight: '800' },
  footerValueBold: { fontSize: 14.5, fontWeight: '800' },
});
