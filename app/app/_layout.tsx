import "../global.css";

import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { colors } from "../src/theme";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { useOfflineSync } from "../src/offline/useOfflineSync";

// Keep the splash screen visible until fonts have finished loading.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Chooses which navigator group to land on once the auth session has been
 * read from storage: returning users with a stored token skip straight to
 * `(tabs)`, everyone else starts at `(onboarding)`. Rendered only after
 * `isBootstrapping` resolves so `initialRouteName` is correct from the
 * first frame - no flash of the wrong screen before a redirect kicks in.
 */
function RootNavigator() {
  const { isBootstrapping, isAuthenticated } = useAuth();
  useOfflineSync();

  if (isBootstrapping) {
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  return (
    <Stack
      initialRouteName={isAuthenticated ? "(tabs)" : "(onboarding)"}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Registered under simple aliases so `fontFamily: "Outfit"` /
    // `fontFamily: "JetBrainsMono"` (see tailwind.config.js) resolve
    // directly to the regular weight.
    Outfit: Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    JetBrainsMono: JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    // Body/UI copy font per the mockup design (`--body: 'Plus Jakarta
    // Sans'`) - Outfit stays reserved for headings/display text, matching
    // the mockup's `h1,h2,h3,.display{font-family:'Outfit'}` split.
    PlusJakartaSans: PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    // Splash screen is still visible; render nothing (or a bare loading
    // view as a fallback for platforms where the native splash isn't used).
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
