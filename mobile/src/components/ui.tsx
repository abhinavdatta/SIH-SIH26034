// ═══════════════════════════════════════════════════════════════
// UI — small shared component kit for the LMCC mobile app.
// Plain React Native primitives, dark-first, no UI library.
// ═══════════════════════════════════════════════════════════════

import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  C,
  F,
  FIELD_STATUS_META,
  R,
  REVIEW_STATUS_META,
  SCAN_STATUS_META,
  SEVERITY_META,
  formatPct,
  type Tone,
} from '@/theme';

/* ── Layout ── */

export function Screen({
  children,
  scroll = true,
  padding = 16,
}: {
  children: ReactNode;
  scroll?: boolean;
  padding?: number;
}) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, padding }}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

/* ── Text ── */

export function T({
  children,
  size = F.md,
  color = C.text,
  weight,
  style,
  align,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  weight?: '400' | '500' | '600' | '700';
  style?: StyleProp<ViewStyle> | object;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
}) {
  return (
    <Text
      style={{ fontSize: size, color, fontWeight: weight ?? '400', textAlign: align, ...(style as object) }}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <T size={F.xs} color={C.textFaint} weight="700" style={{ letterSpacing: 1.2 }}>
        {children}
      </T>
      {action}
    </View>
  );
}

/* ── Button ── */

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'primary'
      ? C.primary
      : variant === 'danger'
        ? 'rgba(239,68,68,0.16)'
        : variant === 'success'
          ? 'rgba(16,185,129,0.16)'
          : 'transparent';
  const fg =
    variant === 'primary' ? C.onPrimary : variant === 'danger' ? '#F87171' : variant === 'success' ? '#34D399' : C.primaryBright;
  const border = variant === 'outline' || variant === 'danger' || variant === 'success' ? fg : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg },
        border ? { borderWidth: 1.4, borderColor: border } : null,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style as StyleProp<ViewStyle>,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <T
          size={small ? F.sm : F.md}
          color={fg}
          weight="600"
          align="center"
          style={small ? { letterSpacing: 0.2 } : { letterSpacing: 0.3 }}
        >
          {title}
        </T>
      )}
    </Pressable>
  );
}

/* ── Input ── */

export function Input({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <T size={F.sm} color={C.textDim} weight="600" style={{ marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={C.textFaint}
        {...props}
        style={[styles.input, props.style as StyleProp<ViewStyle>]}
      />
      {hint && !error ? (
        <T size={F.xs} color={C.textFaint} style={{ marginTop: 5 }}>
          {hint}
        </T>
      ) : null}
      {error ? (
        <T size={F.xs} color="#F87171" style={{ marginTop: 5 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

/* ── Badges ── */

export function Badge({
  text,
  tone = 'slate',
  small,
}: {
  text: string;
  tone?: Tone;
  small?: boolean;
}) {
  const t = { green: C.green, amber: C.amber, red: C.red, blue: C.blue, slate: C.slate, violet: C.violet }[tone];
  return (
    <View
      style={{
        backgroundColor:
          tone === 'green'
            ? 'rgba(16,185,129,0.14)'
            : tone === 'amber'
              ? 'rgba(245,158,11,0.14)'
              : tone === 'red'
                ? 'rgba(239,68,68,0.14)'
                : tone === 'blue'
                  ? 'rgba(59,130,246,0.14)'
                  : tone === 'violet'
                    ? 'rgba(139,92,246,0.14)'
                    : 'rgba(100,116,139,0.16)',
        borderWidth: 1,
        borderColor:
          tone === 'green'
            ? 'rgba(16,185,129,0.4)'
            : tone === 'amber'
              ? 'rgba(245,158,11,0.4)'
              : tone === 'red'
                ? 'rgba(239,68,68,0.4)'
                : tone === 'blue'
                  ? 'rgba(59,130,246,0.4)'
                  : tone === 'violet'
                    ? 'rgba(139,92,246,0.4)'
                    : 'rgba(100,116,139,0.35)',
        borderRadius: R.pill,
        paddingHorizontal: small ? 8 : 11,
        paddingVertical: small ? 2 : 4,
      }}
    >
      <T size={small ? F.xs : F.sm} color={t} weight="600">
        {text}
      </T>
    </View>
  );
}

export function ScanStatusBadge({ status, small }: { status: string; small?: boolean }) {
  const meta = SCAN_STATUS_META[status] ?? { label: status, tone: 'slate' as Tone };
  return <Badge text={meta.label} tone={meta.tone} small={small} />;
}

export function FieldStatusBadge({ status, small }: { status: string; small?: boolean }) {
  const meta = FIELD_STATUS_META[status] ?? { label: status, tone: 'slate' as Tone };
  return <Badge text={meta.label} tone={meta.tone} small={small} />;
}

export function ReviewStatusBadge({ status, small }: { status: string; small?: boolean }) {
  const meta = REVIEW_STATUS_META[status] ?? { label: status, tone: 'slate' as Tone };
  return <Badge text={meta.label} tone={meta.tone} small={small} />;
}

export function SeverityBadge({ severity, small }: { severity?: string; small?: boolean }) {
  if (!severity) return null;
  const meta = SEVERITY_META[severity] ?? { label: severity, tone: 'slate' as Tone };
  return <Badge text={meta.label} tone={meta.tone} small={small} />;
}

export function ConfidenceBadge({ value, small }: { value: number; small?: boolean }) {
  if (!value || value <= 0) return null;
  const tone: Tone = value >= 0.85 ? 'green' : value >= 0.6 ? 'amber' : 'red';
  return <Badge text={`● ${formatPct(value)}`} tone={tone} small={small} />;
}

/* ── Stat card ── */

export function Stat({
  label,
  value,
  tone = 'slate',
  sub,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  sub?: string;
}) {
  const color =
    tone === 'green' ? '#34D399' : tone === 'amber' ? '#FBBF24' : tone === 'red' ? '#F87171' : tone === 'blue' ? '#60A5FA' : tone === 'violet' ? '#A78BFA' : C.text;
  return (
    <View style={styles.stat}>
      <T size={F.xxl} color={color} weight="700">
        {value}
      </T>
      <T size={F.xs} color={C.textDim} weight="600" style={{ marginTop: 2 }}>
        {label}
      </T>
      {sub ? (
        <T size={F.xs} color={C.textFaint} style={{ marginTop: 1 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

/* ── Bar (violation breakdown) ── */

export function MeterBar({ value, tone = 'blue' }: { value: number; tone?: Tone }) {
  const color =
    tone === 'green' ? C.green : tone === 'amber' ? C.amber : tone === 'red' ? C.red : tone === 'violet' ? C.violet : C.primary;
  return (
    <View style={{ height: 6, backgroundColor: C.bgSoft, borderRadius: R.pill, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.max(2, Math.min(100, value * 100))}%`, backgroundColor: color, borderRadius: R.pill }} />
    </View>
  );
}

/* ── Empty state ── */

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <T size={F.xl} weight="700">
        ⚖️
      </T>
      <T size={F.lg} weight="600" align="center" style={{ marginTop: 8 }}>
        {title}
      </T>
      {subtitle ? (
        <T size={F.sm} color={C.textDim} align="center" style={{ marginTop: 4 }}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

/* ── Modal sheet ── */

export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.sheetHeader}>
          <T size={F.lg} weight="700">
            {title}
          </T>
          <Pressable onPress={onClose} hitSlop={12}>
            <T size={F.lg} color={C.textDim} weight="600">
              Close
            </T>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {scroll ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={{ padding: 16, flex: 1 }}>{children}</View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/* ── List row (pressable) ── */

export function ListRow({
  onPress,
  onLongPress,
  children,
  style,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.75 }, style as StyleProp<ViewStyle>]}
    >
      {children}
    </Pressable>
  );
}

/* ── Fullscreen busy overlay ── */

export function BusyOverlay({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.busyOverlay}>
        <View style={styles.busyCard}>
          <ActivityIndicator size="large" color={C.primaryBright} />
          <T size={F.md} color={C.text} weight="600" align="center" style={{ marginTop: 14 }}>
            {label}
          </T>
        </View>
      </View>
    </Modal>
  );
}

/* ── Error banner ── */

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <T size={F.sm} color="#FCA5A5">
        {message}
      </T>
    </View>
  );
}

export function InfoBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.infoBanner}>
      <T size={F.sm} color="#93C5FD">
        {message}
      </T>
    </View>
  );
}

export function SuccessBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.successBanner}>
      <T size={F.sm} color="#6EE7B7">
        {message}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  btn: {
    borderRadius: R.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.sm },
  input: {
    backgroundColor: C.bgSoft,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    color: C.text,
    fontSize: F.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    minWidth: '48%',
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  empty: { alignItems: 'center', padding: 36 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  listRow: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  busyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  busyCard: {
    backgroundColor: C.card,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: 26,
    width: '100%',
    maxWidth: 320,
  },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: R.md,
    padding: 12,
    marginBottom: 12,
  },
  infoBanner: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    borderRadius: R.md,
    padding: 12,
    marginBottom: 12,
  },
  successBanner: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    borderRadius: R.md,
    padding: 12,
    marginBottom: 12,
  },
});
