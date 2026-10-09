// ═══════════════════════════════════════════════════════════════
// Review Queue — every field still awaiting human judgement, across
// all scans. Officers approve what OCR got right and override what
// it got wrong; overrides re-run the deterministic rule check.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useReviewQueue, notifyDataChange } from '@/lib/hooks';
import { updateFieldReview } from '@/lib/local-data';
import { C, F, formatDate, formatPct } from '@/theme';
import {
  Badge,
  Btn,
  Card,
  ConfidenceBadge,
  Empty,
  FieldStatusBadge,
  Input,
  Screen,
  SectionTitle,
  SeverityBadge,
  Sheet,
  T,
} from '@/components/ui';

export default function ReviewQueueScreen() {
  const { user } = useAuth();
  const queue = useReviewQueue();
  const isOfficer = user?.role === 'compliance_officer';

  const [overrideKey, setOverrideKey] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState('');

  const groups = useMemo(() => {
    const map = new Map<string, typeof queue>();
    for (const item of queue) {
      const list = map.get(item.scanId) ?? [];
      list.push(item);
      map.set(item.scanId, list);
    }
    return Array.from(map.entries());
  }, [queue]);

  if (!isOfficer) {
    return (
      <Screen>
        <Empty title="Review Queue is officer-only" subtitle="Seller accounts can correct their own scans from Scan History → open a scan → Edit." />
        <Btn title="Back" variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  function approve(item: (typeof queue)[number]) {
    const res = updateFieldReview(item.scanId, item.scanFieldId, { reviewStatus: 'approved' });
    if (res.success) notifyDataChange();
  }

  function submitOverride() {
    if (!overrideKey) return;
    const item = queue.find((q) => q.id === overrideKey);
    if (!item) return;
    const res = updateFieldReview(item.scanId, item.scanFieldId, {
      value: overrideValue,
      reviewStatus: 'overridden',
    });
    if (res.success) {
      notifyDataChange();
      setOverrideKey(null);
    }
  }

  const currentItem = queue.find((q) => q.id === overrideKey);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <T size={F.xxl} weight="700">
          👤 Review Queue
        </T>
        <Badge text={`${queue.length} pending`} tone={queue.length > 0 ? 'amber' : 'green'} small />
      </View>

      {queue.length === 0 ? (
        <Empty title="Queue clear" subtitle="Every extracted field has been approved or overridden. New scans with low-confidence or failing fields land here." />
      ) : (
        groups.map(([scanId, items]) => (
          <View key={scanId}>
            <SectionTitle>
              {items[0].scanProductName.toUpperCase()} · {formatDate(items[0].createdAt)}
            </SectionTitle>
            <View style={{ gap: 10 }}>
              {items.map((item) => (
                <Card key={item.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <T size={F.md} weight="600">
                        {item.fieldLabel}
                      </T>
                      {item.ruleReference ? (
                        <T size={F.xs} color={C.primaryBright} style={{ marginTop: 1 }}>
                          {item.ruleReference}
                        </T>
                      ) : null}
                    </View>
                    <SeverityBadge severity={item.severity} small />
                  </View>
                  <T size={F.md} color={item.originalValue ? C.text : C.textFaint} style={{ marginTop: 6 }}>
                    {item.originalValue ?? '— not declared —'}
                  </T>
                  {item.notes ? (
                    <T size={F.xs} color={C.textFaint} style={{ marginTop: 4 }}>
                      {item.notes}
                    </T>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ConfidenceBadge value={item.confidence} small />
                    <FieldStatusBadge status={item.complianceStatus} small />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Btn title="Approve as-is" variant="success" small onPress={() => approve(item)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Btn
                        title="Override value"
                        variant="outline"
                        small
                        onPress={() => {
                          setOverrideKey(item.id);
                          setOverrideValue(item.originalValue ?? '');
                        }}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ))
      )}

      <Sheet visible={overrideKey !== null} onClose={() => setOverrideKey(null)} title="Override field" scroll>
        <T size={F.sm} color={C.textDim} style={{ marginBottom: 12 }}>
          {currentItem ? `${currentItem.scanProductName} — ${currentItem.fieldLabel}. ` : ''}
          Type what the label actually says; the rule check re-runs on save.
        </T>
        <Input value={overrideValue} onChangeText={setOverrideValue} placeholder="Corrected value" multiline />
        <Btn title="Save override" onPress={submitOverride} />
      </Sheet>
    </Screen>
  );
}
