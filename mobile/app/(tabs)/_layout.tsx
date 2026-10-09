// ═══════════════════════════════════════════════════════════════
// Tab bar — Dashboard · Scan · Audit · History · Settings.
// Requires a session; unauthenticated users are bounced to login.
// ═══════════════════════════════════════════════════════════════

import { Text } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/theme';

function TabIcon({ glyph }: { glyph: string }) {
  return <Text style={{ fontSize: 20 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { user, hydrated } = useAuth();
  if (!hydrated) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primaryBright,
        tabBarInactiveTintColor: C.textFaint,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border, borderTopWidth: 1 },
        tabBarLabelStyle: { fontSize: F.xs, fontWeight: '600' },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: () => <TabIcon glyph="📊" /> }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: () => <TabIcon glyph="📷" /> }} />
      <Tabs.Screen name="audit" options={{ title: 'Audit', tabBarIcon: () => <TabIcon glyph="🧾" /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: () => <TabIcon glyph="🕘" /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: () => <TabIcon glyph="⚙️" /> }} />
    </Tabs>
  );
}
