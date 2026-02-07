import '@/lib/nativeShims';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, useLocalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';
import { View, Platform, Text, StyleSheet } from 'react-native';

import { Colors } from '@/constants/Colors';
import { getStoredKeypair, getStoredUsername, storeUsername } from '@/lib/keychain';
import { uint8ToBase58, getEncryptionKeypair, uint8ToBase64 } from '@/lib/crypto';
import { getUsernameByOwner } from '@/lib/api';
import { startMessageListener } from '@/lib/websocket';
import { registerForPushNotifications, setupNotificationChannel, configureNotifications } from '@/lib/notifications';

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text style={{ color: Colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Something went wrong</Text>
      <Text style={{ color: Colors.text, marginBottom: 20, textAlign: 'center' }}>{error.message}</Text>
      <TouchableOpacity onPress={retry} style={{ backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
        <Text style={{ color: '#000', fontWeight: 'bold' }}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

export const unstable_settings = {
  initialRouteName: 'onboarding',
};

SplashScreen.preventAutoHideAsync();

const KeyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
    notification: Colors.primary,
  },
};

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TouchableOpacity } from 'react-native';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) {
      console.error('Failed to load fonts:', error);
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const query = useLocalSearchParams<{ bypass?: string }>();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hasIdentity, setHasIdentity] = useState(false);
  const prevSegments = useRef<string[]>([]);
  const bypassCheckedRef = useRef(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Re-check auth when navigating FROM onboarding (catches post-registration)
  // This ensures we pick up newly created credentials after onboarding completes
  useEffect(() => {
    const wasOnboarding = prevSegments.current[0] === 'onboarding';
    const isOnboarding = segments[0] === 'onboarding';

    // If we just left onboarding without identity, re-check auth
    // This handles the case where user just completed registration
    if (wasOnboarding && !isOnboarding && !hasIdentity && !isCheckingAuth) {
      console.log('🔄 Re-checking auth after leaving onboarding (new registration)...');
      checkAuth();
    }

    prevSegments.current = segments;
  }, [segments, hasIdentity, isCheckingAuth]);

  useEffect(() => {
    if (isCheckingAuth) return;

    const inOnboarding = segments[0] === 'onboarding';
    const isBypass = query.bypass === 'true';

    if (!hasIdentity && !inOnboarding) {
      router.replace('/onboarding');
    } else if (hasIdentity && inOnboarding && !isBypass) {
      router.replace('/(tabs)');
    } else if (isBypass && inOnboarding && !bypassCheckedRef.current) {
      bypassCheckedRef.current = true;
      checkAuth();
    }
  }, [isCheckingAuth, hasIdentity, segments]);

  // Push notification setup
  useEffect(() => {
    if (hasIdentity) {
      configureNotifications();
      setupNotificationChannel();
      registerForPushNotifications().then(token => {
        if (token) console.log('🔔 Push notifications registered:', token);
      }).catch(err => console.warn('Push setup failed:', err));
    }
  }, [hasIdentity]);

  const checkAuth = async () => {
    try {
      console.log('🔍 Checking auth...');

      // Get stored credentials with defensive error handling
      let keypair = null;
      let cachedUsername = null;

      try {
        [keypair, cachedUsername] = await Promise.all([
          getStoredKeypair(),
          getStoredUsername(),
        ]);
      } catch (err) {
        console.error('Failed to retrieve stored credentials:', err);
        // If keychain access fails, treat as no identity
        setHasIdentity(false);
        setIsCheckingAuth(false);
        return;
      }

      console.log('🔑 Keypair found:', !!keypair);
      console.log('👤 Username found:', cachedUsername);
      let resolvedUsername = cachedUsername;

      // If keys exist but username missing, attempt recovery from API
      if (keypair && !resolvedUsername) {
        try {
          const ownerPubkey = uint8ToBase58(keypair.publicKey);
          const user = await getUsernameByOwner(ownerPubkey);
          if (user?.username) {
            resolvedUsername = user.username;
            await storeUsername(user.username);
          }
        } catch (err) {
          console.warn('Username recovery failed:', err);
        }
      }

      // Initialize encryption and start services
      if (keypair && resolvedUsername) {
        try {
          // Initialize storage encryption with the user's keypair
          const { initStorageEncryption } = await import('@/lib/storage');
          initStorageEncryption(keypair.secretKey);
          console.log('✅ Storage encryption initialized');
        } catch (err) {
          console.error('Failed to initialize storage encryption:', err);
          // Continue anyway - storage will fall back to unencrypted mode
        }

        // Start WebSocket listener for incoming messages
        try {
          await startMessageListener();
          console.log('✅ Message listener started');
        } catch (err) {
          console.warn('Failed to start message listener:', err);
          // Non-critical - continue without real-time messages
        }
      }

      // Diagnostic logging
      console.log('🔍 Auth state:', {
        hasKeypair: !!keypair,
        cachedUsername,
        resolvedUsername,
        decision: !!keypair && !!resolvedUsername
      });

      // Always set identity state based on actual values (moved outside conditional)
      // This ensures we don't get stuck in onboarding if username recovery fails
      setHasIdentity(!!keypair && !!resolvedUsername);
    } catch (error) {
      console.error('Auth check failed:', error);
      // On any unexpected error, treat as no identity to allow recovery
      setHasIdentity(false);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.primary, fontSize: 24 }}>⚿</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Web Security Warning */}
      {Platform.OS === 'web' && (
        <View style={styles.webWarning}>
          <Text style={styles.webWarningText}>
            ⚠️ Web version stores keys in localStorage (less secure). Use the mobile app for best security.
          </Text>
        </View>
      )}

      <ThemeProvider value={KeyDarkTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="new-chat"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'New Chat',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="chat/[username]"
            options={{
              headerShown: true,
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="tos-modal"
            options={{ presentation: 'modal', headerShown: false }}
          />
        </Stack>
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  webWarning: {
    backgroundColor: '#FFA726',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  webWarningText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
