// ═══════════════════════════════════════════════════════════════
// Legal Reference — offline, full-text reference of the Legal
// Metrology (Packaged Commodities) Rules, 2011: the eight mandatory
// declarations, the rules themselves, the penalty table, and the
// compliance-check categories. Officer/admin only, like the web app.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import {
  AMENDMENT_HISTORY,
  COMPLIANCE_CHECKS,
  LEGAL_ACT_TITLE,
  LEGAL_RULES,
  MANDATORY_FIELDS,
  NOTIFICATION_DATE,
  PENALTY_TABLE,
  RULES_TITLE,
} from '@/lib/legal-data';
import { C, F, R } from '@/theme';
import { Badge, Btn, Card, Empty, Screen, SectionTitle, T } from '@/components/ui';

type SectionKey = 'fields' | 'rules' | 'penalties' | 'checks' | 'amendments' | null;

function Accordion({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 10 }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <T size={F.md} weight="700">
            {title}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {count !== undefined ? <Badge text={String(count)} tone="blue" small /> : null}
          <T size={F.lg} color={C.textDim}>
            {open ? '−' : '+'}
          </T>
        </View>
      </Pressable>
      {open ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </Card>
  );
}

export default function LegalReferenceScreen() {
  const { user } = useAuth();
  const isOfficer = user?.role === 'compliance_officer';
  const [open, setOpen] = useState<SectionKey>('fields');

  if (!isOfficer) {
    return (
      <Screen>
        <Empty
          title="Legal Reference is officer-only"
          subtitle="The full offline reference of the LM (PC) Rules, 2011 is available to Compliance Officer / Admin accounts."
        />
        <Btn title="Back" variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  const toggle = (key: SectionKey) => setOpen(open === key ? null : key);

  return (
    <Screen>
      <Card>
        <T size={F.md} weight="700">
          {LEGAL_ACT_TITLE}
        </T>
        <T size={F.sm} color={C.textDim} style={{ marginTop: 2 }}>
          {RULES_TITLE}
        </T>
        <T size={F.xs} color={C.textFaint} style={{ marginTop: 4 }}>
          Notified {NOTIFICATION_DATE} · offline reference embedded in the app
        </T>
      </Card>

      <SectionTitle>REFERENCE</SectionTitle>

      <Accordion
        title="Mandatory declarations — Rule 6(1)"
        count={MANDATORY_FIELDS.length}
        open={open === 'fields'}
        onToggle={() => toggle('fields')}
      >
        <View style={{ gap: 12 }}>
          {MANDATORY_FIELDS.map((field) => (
            <View key={field.fieldKey} style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T size={F.md} weight="600">
                  {field.label}
                </T>
                <Badge text={field.ruleRef} tone="blue" small />
              </View>
              <T size={F.sm} color={C.textDim} style={{ marginTop: 4 }}>
                {field.description}
              </T>
              <T size={F.xs} color={C.textFaint} style={{ marginTop: 4 }}>
                Format: {field.format}
              </T>
              {field.examples.length > 0 ? (
                <T size={F.xs} color={C.textFaint} style={{ marginTop: 2 }}>
                  e.g. {field.examples.join(' · ')}
                </T>
              ) : null}
              <View style={{ marginTop: 6 }}>
                <Badge text={`Severity ${field.severity}`} tone={field.severity === 'HIGH' ? 'red' : field.severity === 'MEDIUM' ? 'amber' : 'slate'} small />
              </View>
            </View>
          ))}
        </View>
      </Accordion>

      <Accordion title="The Rules" count={LEGAL_RULES.length} open={open === 'rules'} onToggle={() => toggle('rules')}>
        <View style={{ gap: 12 }}>
          {LEGAL_RULES.map((rule) => (
            <View key={rule.ruleRef} style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <T size={F.md} weight="600">
                  {rule.title}
                </T>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge text={rule.ruleRef} tone="blue" small />
                  {rule.mandatory ? <Badge text="Mandatory" tone="red" small /> : null}
                </View>
              </View>
              <T size={F.sm} color={C.textDim} style={{ marginTop: 4 }}>
                {rule.description}
              </T>
              {rule.penaltyRef ? (
                <T size={F.xs} color={C.textFaint} style={{ marginTop: 4 }}>
                  Penalty: {rule.penaltyRef}
                </T>
              ) : null}
            </View>
          ))}
        </View>
      </Accordion>

      <Accordion title="Penalty table" count={PENALTY_TABLE.length} open={open === 'penalties'} onToggle={() => toggle('penalties')}>
        <View style={{ gap: 12 }}>
          {PENALTY_TABLE.map((row) => (
            <View key={row.offence} style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <T size={F.md} weight="600">
                {row.offence}
              </T>
              <T size={F.sm} color={C.textDim} style={{ marginTop: 4 }}>
                First offence: {row.firstOffence}
              </T>
              <T size={F.sm} color={C.textDim}>
                Subsequent: {row.subsequentOffence}
              </T>
              <T size={F.xs} color={C.primaryBright} style={{ marginTop: 4 }}>
                {row.ruleRef}
              </T>
            </View>
          ))}
        </View>
      </Accordion>

      <Accordion title="Compliance check categories" count={COMPLIANCE_CHECKS.length} open={open === 'checks'} onToggle={() => toggle('checks')}>
        <View style={{ gap: 12 }}>
          {COMPLIANCE_CHECKS.map((check) => (
            <View key={check.category} style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <T size={F.md} weight="600">
                {check.category}
              </T>
              <T size={F.sm} color={C.textDim} style={{ marginTop: 4 }}>
                {check.description}
              </T>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {check.fields.map((f) => (
                  <Badge key={f} text={f} tone="slate" small />
                ))}
              </View>
            </View>
          ))}
        </View>
      </Accordion>

      <Accordion title="Amendment history" count={AMENDMENT_HISTORY.length} open={open === 'amendments'} onToggle={() => toggle('amendments')}>
        <View style={{ gap: 10 }}>
          {AMENDMENT_HISTORY.map((a) => (
            <View key={a.year} style={{ flexDirection: 'row', gap: 10 }}>
              <Badge text={String(a.year)} tone="violet" small />
              <View style={{ flex: 1 }}>
                <T size={F.sm} color={C.textDim}>
                  {a.description}
                </T>
              </View>
            </View>
          ))}
        </View>
      </Accordion>

      <T size={F.xs} color={C.textFaint} style={{ marginTop: 16 }}>
        Not legal advice — verify compliance determinations against the official Rules text.
      </T>
    </Screen>
  );
}
