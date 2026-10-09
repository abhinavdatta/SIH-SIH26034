// ═══════════════════════════════════════════════════════════════
// Scan History — every scan on this account (local cache, synced
// with the server on sign-in and every change). Filter by status,
// search by product, open the full compliance report, export the
// whole history as CSV.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useScans, notifyDataChange } from '@/lib/hooks';
import { deleteScan } from '@/lib/local-data';
import { shareHistoryCsv } from '@/lib/export';
import { C, F, R, formatDate } from '@/theme';
import {
  Badge,
  Btn,
  ConfidenceBadge,
  Empty,
  ListRow,
  ScanStatusBadge,
  Screen,
  T,
} from '@/components/ui';

type Filter = 'all' | 'needs_review' | 'non_compliant' | 'compliant';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'non_compliant', label: 'Non-compliant' },
  { key: 'compliant', label: 'Compliant' },
];

export default function HistoryScreen() {
  const scans = useScans();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scans.filter((scan) => {
      if (filter !== 'all' && scan.status !== filter) return false;
      if (q && !`${scan.productName} ${scan.manufacturerName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scans, filter, query]);

  async function doExport() {
    setExporting(true);
    await shareHistoryCsv(scans);
    setExporting(false);
  }

  function confirmRemove(id: string, name: string) {
    Alert.alert('Delete scan?', `Remove "${name}" from history? This also removes it from your account on the next sync.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeScan(id) },
    ]);
  }

  function removeScan(id: string) {
    deleteScan(id);
    notifyDataChange();
  }

  return (
    <Screen scroll={false} padding={0}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <T size={F.xxl} weight="700">
            🕘 Scan History
          </T>
          <T size={F.sm} color={C.textDim}>
            {scans.length} scan{scans.length === 1 ? '' : 's'}
          </T>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search product or manufacturer…"
          placeholderTextColor={C.textFaint}
          style={{
            backgroundColor: C.bgSoft,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: R.md,
            color: C.text,
            fontSize: F.md,
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginBottom: 10,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: R.pill,
                borderWidth: 1.4,
                borderColor: filter === f.key ? C.primary : C.border,
                backgroundColor: filter === f.key ? 'rgba(59,130,246,0.14)' : 'transparent',
              }}
            >
              <T size={F.sm} color={filter === f.key ? C.primaryBright : C.textDim} weight="600">
                {f.label}
              </T>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <Empty
            title={scans.length === 0 ? 'No scans yet' : 'Nothing matches this filter'}
            subtitle={scans.length === 0 ? 'Scan a label or audit a product to build history. Scans sync to your account across devices.' : undefined}
          />
        }
        renderItem={({ item }) => {
          const activeViolations = item.violations.filter((v) => !v.isOverridden).length;
          return (
            <ListRow onPress={() => router.push(`/scan/${item.id}`)} onLongPress={() => confirmRemove(item.id, item.productName)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <T size={F.md} weight="600" numberOfLines={1}>
                    {item.productName}
                  </T>
                  <T size={F.sm} color={C.textDim} numberOfLines={1}>
                    {item.manufacturerName}
                  </T>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <ScanStatusBadge status={item.status} small />
                    {activeViolations > 0 ? <Badge text={`${activeViolations} violation${activeViolations === 1 ? '' : 's'}`} tone="red" small /> : null}
                    <ConfidenceBadge value={item.ocrConfidence} small />
                  </View>
                </View>
                <T size={F.xs} color={C.textFaint}>
                  {formatDate(item.createdAt)}
                </T>
              </View>
            </ListRow>
          );
        }}
      />

      {scans.length > 0 ? (
        <View style={{ padding: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
          <Btn title="Export all history as CSV" variant="outline" onPress={doExport} loading={exporting} small />
          <T size={F.xs} color={C.textFaint} align="center" style={{ marginTop: 8 }}>
            Long-press a scan to delete it from this device (and sync the removal on next push).
          </T>
        </View>
      ) : null}
    </Screen>
  );
}
