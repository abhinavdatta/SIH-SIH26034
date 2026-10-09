// ═══════════════════════════════════════════════════════════════
// Product Declarations Audit — manual entry with a live compliance
// preview. Audit a product WITHOUT any photo: type what the label
// declares, leave gaps empty, and the rules engine decides what's
// compliant, what's missing, and what needs review.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { createScanFromFields } from '@/lib/local-data';
import { notifyDataChange } from '@/lib/hooks';
import { PRODUCT_FIELDS, FIELD_GROUPS } from '@/lib/extract/types';
import { runComplianceCheck } from '@/lib/compliance-rules';
import { C, F } from '@/theme';
import {
  Btn,
  Card,
  FieldStatusBadge,
  Input,
  Screen,
  SectionTitle,
  T,
} from '@/components/ui';

/** Manual entry is high-confidence: the human typed what the label says. */
const MANUAL_CONFIDENCE = 0.99;

export default function AuditScreen() {
  const [productName, setProductName] = useState('');
  const [manufacturerName, setManufacturerName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim().length > 0).length,
    [values]
  );

  /** Live preview: what the engine would say about the current values. */
  const preview = useMemo(() => {
    return PRODUCT_FIELDS.map((field) => {
      const value = values[field.key]?.trim() || null;
      const check = runComplianceCheck(field.key, value, value ? MANUAL_CONFIDENCE : 0);
      return { key: field.key, label: field.label, tier: field.tier, value, status: check.complianceStatus };
    });
  }, [values]);

  const grouped = useMemo(() => {
    const groups: Array<{ key: string; label: string; fields: typeof preview }> = [];
    for (const group of FIELD_GROUPS) {
      const fields = preview.filter((f) => PRODUCT_FIELDS.find((p) => p.key === f.key)?.group === group.key);
      if (fields.length > 0) groups.push({ key: group.key, label: group.label, fields });
    }
    return groups;
  }, [preview]);

  async function submit() {
    setError(null);
    if (productName.trim().length < 2) {
      setError('Enter the product name');
      return;
    }
    setSaving(true);
    try {
      const scan = createScanFromFields({
        productName: productName.trim(),
        manufacturerName: manufacturerName.trim() || null,
        fields: PRODUCT_FIELDS.map((field) => ({
          fieldName: field.key,
          value: values[field.key]?.trim() || null,
          confidence: values[field.key]?.trim() ? MANUAL_CONFIDENCE : 0,
          notes: null,
        })),
        ocrConfidence: MANUAL_CONFIDENCE,
      });
      notifyDataChange();
      setSaving(false);
      router.push(`/scan/${scan.id}`);
    } catch {
      setSaving(false);
      setError('Could not save the audit — try again.');
    }
  }

  return (
    <Screen>
      <T size={F.xxl} weight="700" style={{ marginBottom: 4 }}>
        🧾 Product Audit
      </T>
      <T size={F.sm} color={C.textDim} style={{ marginBottom: 16 }}>
        Enter the declarations exactly as printed on the label. Empty mandatory fields are recorded as missing declarations — that is the violation.
      </T>

      {error ? (
        <Card style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.5)' }}>
          <T size={F.sm} color="#F87171">
            {error}
          </T>
        </Card>
      ) : null}

      <Card>
        <Input label="Product name" value={productName} onChangeText={setProductName} placeholder="e.g. Amul Taaza Toned Milk" />
        <Input label="Manufacturer / packer name" value={manufacturerName} onChangeText={setManufacturerName} placeholder="e.g. GCMMF Ltd." />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={F.sm} color={C.textDim}>
            {filledCount} of {PRODUCT_FIELDS.length} declarations filled
          </T>
        </View>
      </Card>

      {grouped.map((group) => (
        <View key={group.key}>
          <SectionTitle>
            {group.label.toUpperCase()}
            {group.key === 'hazard' ? ' — ADVISORY' : ''}
          </SectionTitle>
          <Card>
            {group.fields.map((field, i) => (
              <View key={field.key} style={{ marginBottom: i === group.fields.length - 1 ? 0 : 16 }}>
                <Input
                  label={field.label}
                  value={values[field.key] ?? ''}
                  onChangeText={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                  placeholder="Type what the label declares…"
                  multiline
                />
                <View style={{ marginTop: -8 }}>
                  <FieldStatusBadge status={field.status} small />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <View style={{ marginTop: 22 }}>
        <Btn title={saving ? 'Saving…' : 'Run compliance audit & save'} onPress={submit} loading={saving} />
      </View>
      <T size={F.xs} color={C.textFaint} align="center" style={{ marginTop: 10 }}>
        Manual entries are stored as high-confidence values — they skip the review queue unless a rule fails.
      </T>
    </Screen>
  );
}
