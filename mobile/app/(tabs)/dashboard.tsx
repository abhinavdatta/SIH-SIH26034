// ═══════════════════════════════════════════════════════════════
// Dashboard — live compliance stats over the local (synced) scans:
// status counts, violation rate, most-violated fields, recent scans,
// and the officer-only entries into Review Queue / Legal Reference.
// ═══════════════════════════════════════════════════════════════

import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useDashboard, useReviewQueue } from '@/lib/hooks';
import { FIELD_KEY_TO_LABEL } from '@/lib/types';
import { C, F, formatDate, formatPct } from '@/theme';
import {
  Badge,
  Card,
  ConfidenceBadge,
  Empty,
  ListRow,
  MeterBar,
  ScanStatusBadge,
  Screen,
  SectionTitle,
  Stat,
  StatGrid,
  T,
} from '@/components/ui';

export default function DashboardScreen() {
  const { user } = useAuth();
  const stats = useDashboard();
  const queue = useReviewQueue();
  const isOfficer = user?.role === 'compliance_officer';

  const maxViolationCount = stats.violationByType[0]?.count ?? 0;

  return (
    <Screen>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <T size={F.xxl} weight="700">
            ⚖️ Dashboard
          </T>
          <T size={F.sm} color={C.textDim} numberOfLines={1}>
            {user ? `${user.name}${user.employeeId ? ` · ${user.employeeId}` : ''}` : ''}
          </T>
        </View>
        <Badge text={isOfficer ? '🛡️ Officer' : '🏪 Seller'} tone={isOfficer ? 'violet' : 'blue'} small />
      </View>

      {/* Stats */}
      <StatGrid>
        <Stat label="Total Scans" value={stats.totalScans} tone="blue" />
        <Stat label="Compliant" value={stats.compliantScans} tone="green" />
        <Stat label="Non-Compliant" value={stats.nonCompliantScans} tone="red" />
        <Stat label="Needs Review" value={stats.needsReviewScans} tone="amber" />
      </StatGrid>
      <Card style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={F.md} weight="600">
            Violation rate
          </T>
          <T size={F.xxl} weight="700" color={stats.violationRate > 0 ? '#F87171' : '#34D399'}>
            {stats.violationRate.toFixed(1)}%
          </T>
        </View>
        <View style={{ marginTop: 10 }}>
          <MeterBar value={Math.min(1, stats.violationRate / 100)} tone={stats.violationRate > 0 ? 'red' : 'green'} />
        </View>
      </Card>

      {/* Officer quick actions */}
      {isOfficer ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Pressable style={{ flex: 1 }} onPress={() => router.push('/review')}>
            <Card>
              <T size={F.lg}>👤</T>
              <T size={F.md} weight="600" style={{ marginTop: 4 }}>
                Review Queue
              </T>
              <T size={F.sm} color={C.textDim}>
                {queue.length} field{queue.length === 1 ? '' : 's'} awaiting review
              </T>
            </Card>
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => router.push('/legal')}>
            <Card>
              <T size={F.lg}>📚</T>
              <T size={F.md} weight="600" style={{ marginTop: 4 }}>
                Legal Reference
              </T>
              <T size={F.sm} color={C.textDim}>
                LM (PC) Rules, 2011
              </T>
            </Card>
          </Pressable>
        </View>
      ) : null}

      {/* Violations by type */}
      <SectionTitle>MOST VIOLATED FIELDS</SectionTitle>
      {stats.topViolatedFields.length === 0 ? (
        <Card>
          <T size={F.sm} color={C.textDim} align="center">
            No violations recorded — scan a label or audit a product to see field-level findings.
          </T>
        </Card>
      ) : (
        <Card>
          {stats.topViolatedFields.slice(0, 6).map((v, i) => (
            <View key={v.fieldName} style={{ marginBottom: i === 5 ? 0 : 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <T size={F.sm} weight="600" numberOfLines={1} style={{ flex: 1, marginRight: 8 }}>
                  {v.fieldLabel}
                </T>
                <T size={F.sm} color={C.textDim}>
                  {v.count}
                </T>
              </View>
              <MeterBar value={maxViolationCount ? v.count / maxViolationCount : 0} tone="red" />
            </View>
          ))}
        </Card>
      )}

      {/* Recent scans */}
      <SectionTitle
        action={
          <Pressable onPress={() => router.push('/(tabs)/history')}>
            <T size={F.sm} color={C.primaryBright} weight="600">
              View all →
            </T>
          </Pressable>
        }
      >
        RECENT SCANS
      </SectionTitle>
      {stats.recentScans.length === 0 ? (
        <Empty title="No scans yet" subtitle="Use the Scan tab to photograph a product label, or the Audit tab to enter declarations manually." />
      ) : (
        <View style={{ gap: 10 }}>
          {stats.recentScans.slice(0, 5).map((scan) => (
            <ListRow key={scan.id} onPress={() => router.push(`/scan/${scan.id}`)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <T size={F.md} weight="600" numberOfLines={1}>
                    {scan.productName}
                  </T>
                  <T size={F.sm} color={C.textDim} numberOfLines={1}>
                    {scan.manufacturerName}
                  </T>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    <ScanStatusBadge status={scan.status} small />
                    {scan.violationsCount > 0 ? <Badge text={`${scan.violationsCount} violation${scan.violationsCount === 1 ? '' : 's'}`} tone="red" small /> : null}
                    <ConfidenceBadge value={scan.ocrConfidence} small />
                  </View>
                </View>
                <T size={F.xs} color={C.textFaint}>
                  {formatDate(scan.createdAt)}
                </T>
              </View>
            </ListRow>
          ))}
        </View>
      )}
    </Screen>
  );
}
