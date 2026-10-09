// ═══════════════════════════════════════════════════════════════
// Compliance Report — the full field-by-field verdict for one scan:
// violations with severity, per-declaration status with rule
// references, review actions (officer), edit-in-place re-run,
// stamped PDF/CSV export, delete.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useScan, notifyDataChange } from '@/lib/hooks';
import { updateScanFromFields, updateFieldReview, deleteScan, type LocalScan } from '@/lib/local-data';
import { PRODUCT_FIELDS } from '@/lib/extract/types';
import { FIELD_KEY_TO_LABEL } from '@/lib/types';
import { shareScanCsv, shareScanPdf } from '@/lib/export';
import { C, F, formatDate, formatPct } from '@/theme';
import {
  Badge,
  Btn,
  Card,
  ConfidenceBadge,
  Empty,
  ErrorBanner,
  FieldStatusBadge,
  Input,
  ReviewStatusBadge,
  ScanStatusBadge,
  Screen,
  SectionTitle,
  SeverityBadge,
  Sheet,
  T,
} from '@/components/ui';

export default function ScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanId = typeof id === 'string' ? id : '';
  const scan = useScan(scanId);
  const { user } = useAuth();
  const isOfficer = user?.role === 'compliance_officer';

  const [overrideFieldId, setOverrideFieldId] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState('');
  const [editManufacturer, setEditManufacturer] = useState('');
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeViolations = useMemo(
    () => (scan ? scan.violations.filter((v) => !v.isOverridden) : []),
    [scan]
  );

  if (!scan) {
    return (
      <Screen>
        <Empty title="Scan not found" subtitle="It may have been deleted on another device. Pull history to refresh." />
        <Btn title="Back to history" variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  function approve(fieldId: string) {
    const res = updateFieldReview(scanId, fieldId, { reviewStatus: 'approved' });
    if (res.success) notifyDataChange();
  }

  function openOverride(scan: LocalScan, fieldId: string, original: string | null) {
    setOverrideFieldId(fieldId);
    setOverrideValue(original ?? '');
  }

  function submitOverride() {
    if (!overrideFieldId) return;
    const res = updateFieldReview(scanId, overrideFieldId, {
      value: overrideValue,
      reviewStatus: 'overridden',
    });
    if (res.success) {
      notifyDataChange();
      setOverrideFieldId(null);
    } else {
      setError('Could not save the override');
    }
  }

  function openEdit(current: LocalScan) {
    setEditProduct(current.productName === 'Unknown Product' ? '' : current.productName);
    setEditManufacturer(current.manufacturerName === 'Unknown Manufacturer' ? '' : current.manufacturerName);
    const values: Record<string, string> = {};
    for (const field of current.fields) values[field.fieldName] = field.value ?? '';
    setEditValues(values);
    setError(null);
    setEditOpen(true);
  }

  function submitEdit() {
    const res = updateScanFromFields(scanId, {
      productName: editProduct.trim() || 'Unknown Product',
      manufacturerName: editManufacturer.trim() || null,
      fields: PRODUCT_FIELDS.map((field) => ({
        fieldName: field.key,
        value: editValues[field.key]?.trim() || null,
        confidence: editValues[field.key]?.trim() ? 0.99 : 0,
        notes: null,
      })),
      ocrConfidence: 0.99,
    });
    if (res) {
      notifyDataChange();
      setEditOpen(false);
    } else {
      setError('Could not update the scan');
    }
  }

  function confirmDelete() {
    Alert.alert('Delete scan?', `Remove "${scan?.productName}" permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteScan(scanId);
          notifyDataChange();
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/history');
        },
      },
    ]);
  }

  async function doExport(kind: 'pdf' | 'csv') {
    if (!scan) return;
    setExporting(kind);
    const ok = kind === 'pdf' ? await shareScanPdf(scan) : await shareScanCsv(scan);
    setExporting(null);
    if (!ok) setError('Could not build the export on this device.');
  }

  const overrideField = scan.fields.find((f) => f.id === overrideFieldId);

  return (
    <Screen>
      {/* Header */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <T size={F.xl} weight="700">
              {scan.productName}
            </T>
            <T size={F.sm} color={C.textDim} style={{ marginTop: 2 }}>
              {scan.manufacturerName}
            </T>
          </View>
          <ScanStatusBadge status={scan.status} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <ConfidenceBadge value={scan.ocrConfidence} small />
          <Badge text={`${activeViolations.length} active violation${activeViolations.length === 1 ? '' : 's'}`} tone={activeViolations.length > 0 ? 'red' : 'green'} small />
          <Badge text={formatDate(scan.createdAt)} tone="slate" small />
        </View>
      </Card>

      <ErrorBanner message={error} />

      {/* Violations */}
      <SectionTitle>VIOLATIONS ({activeViolations.length})</SectionTitle>
      {activeViolations.length === 0 ? (
        <Card>
          <T size={F.sm} color="#34D399" weight="600">
            ✓ No unresolved violations — every mandatory declaration passed its rule check.
          </T>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {activeViolations.map((v) => (
            <Card key={v.id} style={{ borderLeftWidth: 3, borderLeftColor: v.severity === 'HIGH' ? C.red : v.severity === 'MEDIUM' ? C.amber : C.slate }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T size={F.md} weight="600">
                  {FIELD_KEY_TO_LABEL[v.violationType] ?? v.violationType}
                </T>
                <SeverityBadge severity={v.severity} small />
              </View>
              <T size={F.sm} color={C.textDim} style={{ marginTop: 4 }}>
                {v.description}
              </T>
            </Card>
          ))}
        </View>
      )}

      {/* Fields */}
      <SectionTitle>DECLARED FIELDS ({scan.fields.length})</SectionTitle>
      <View style={{ gap: 10 }}>
        {scan.fields.map((field) => (
          <Card key={field.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <T size={F.md} weight="600">
                  {FIELD_KEY_TO_LABEL[field.fieldName] ?? field.fieldName}
                </T>
                {field.ruleReference ? (
                  <T size={F.xs} color={C.primaryBright} style={{ marginTop: 1 }}>
                    {field.ruleReference}
                  </T>
                ) : null}
              </View>
              <FieldStatusBadge status={field.complianceStatus} small />
            </View>
            <T size={F.md} color={field.value ? C.text : C.textFaint} style={{ marginTop: 6 }}>
              {field.value ?? '— not declared —'}
            </T>
            {field.notes ? (
              <T size={F.xs} color={C.textFaint} style={{ marginTop: 4 }}>
                {field.notes}
              </T>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <ConfidenceBadge value={field.confidence} small />
              <ReviewStatusBadge status={field.reviewStatus} small />
              {isOfficer && field.reviewStatus === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
                  <Btn title="Approve" variant="success" small onPress={() => approve(field.id)} />
                  <Btn
                    title="Override"
                    variant="outline"
                    small
                    onPress={() => openOverride(scan, field.id, field.value)}
                  />
                </View>
              ) : null}
            </View>
          </Card>
        ))}
      </View>

      {/* Actions */}
      <SectionTitle>ACTIONS</SectionTitle>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn title="Share PDF report" onPress={() => doExport('pdf')} loading={exporting === 'pdf'} small />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="Share CSV" variant="outline" onPress={() => doExport('csv')} loading={exporting === 'csv'} small />
          </View>
        </View>
        <Btn title="Edit declarations & re-run checks" variant="outline" onPress={() => openEdit(scan)} small />
        <Btn title="Delete scan" variant="danger" onPress={confirmDelete} small />
      </View>
      <T size={F.xs} color={C.textFaint} style={{ marginTop: 8 }}>
        Exports are stamped with your signed-in identity (name · employee ID · email), exactly like the web app.
      </T>

      {/* Override sheet */}
      <Sheet visible={overrideFieldId !== null} onClose={() => setOverrideFieldId(null)} title="Override field" scroll>
        <T size={F.sm} color={C.textDim} style={{ marginBottom: 12 }}>
          Enter the correct value as it appears on the physical label. The compliance check re-runs immediately; a passing value clears the violation.
        </T>
        <T size={F.sm} weight="600" style={{ marginBottom: 8 }}>
          {overrideField ? (FIELD_KEY_TO_LABEL[overrideField.fieldName] ?? overrideField.fieldName) : ''}
        </T>
        <Input value={overrideValue} onChangeText={setOverrideValue} placeholder="Corrected value" multiline />
        <Btn title="Save override" onPress={submitOverride} />
      </Sheet>

      {/* Edit sheet */}
      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title="Edit scan" scroll>
        <Input label="Product name" value={editProduct} onChangeText={setEditProduct} placeholder="Product name" />
        <Input label="Manufacturer" value={editManufacturer} onChangeText={setEditManufacturer} placeholder="Manufacturer" />
        {PRODUCT_FIELDS.map((field) => (
          <Input
            key={field.key}
            label={field.label}
            value={editValues[field.key] ?? ''}
            onChangeText={(v) => setEditValues((prev) => ({ ...prev, [field.key]: v }))}
            placeholder="Declaration as printed"
            multiline
          />
        ))}
        <Btn title="Save & re-run compliance checks" onPress={submitEdit} />
      </Sheet>
    </Screen>
  );
}
