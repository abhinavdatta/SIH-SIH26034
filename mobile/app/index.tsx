// ═══════════════════════════════════════════════════════════════
// Auth gate — route to the tab bar or the login screen based on the
// session reported by /api/auth.
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { C } from '@/theme';

export default function Gate() {
  const { user, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(user ? '/(tabs)/dashboard' : '/login');
  }, [hydrated, user]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={C.primaryBright} />
    </View>
  );
}
