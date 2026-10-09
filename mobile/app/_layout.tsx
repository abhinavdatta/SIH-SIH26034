// ═══════════════════════════════════════════════════════════════
// Root layout — boot sequence + providers + navigation stack.
//
// Boot: hydrate the synchronous store shim (AsyncStorage → memory)
// and the saved server URL BEFORE anything renders, then hand off
// to the auth gate. The splash screen stays up until boot finishes.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { hydrateStore } from '@/lib/storage';
import { initApiBase } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await Promise.all([hydrateStore(), initApiBase()]);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerTitleStyle: { color: C.text, fontWeight: '700' as const },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan/[id]" options={{ title: 'Compliance Report' }} />
        <Stack.Screen name="review" options={{ title: 'Review Queue' }} />
        <Stack.Screen name="legal" options={{ title: 'Legal Reference' }} />
        <Stack.Screen name="settings/security" options={{ title: 'Account Security' }} />
        <Stack.Screen name="settings/providers" options={{ title: 'AI Providers' }} />
      </Stack>
    </AuthProvider>
  );
}
