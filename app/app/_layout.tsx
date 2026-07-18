import "../global.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
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
 *
 * Separately, a one-time effect below covers the case `initialRouteName`
 * can't express on its own: an authenticated user whose account hasn't
 * completed the entrance assessment yet (e.g. they closed the app between
 * finishing account creation and finishing the quiz). `initialRouteName`
 * only picks a top-level group, not a specific screen inside it, so
 * landing them on "(tabs)" and then immediately redirecting into
 * "/(onboarding)/assessment" is the straightforward way to route them to
 * that exact screen rather than back to "welcome" (which they've already
 * been through) or into "home" (which they haven't earned yet).
 */
function RootNavigator() {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const router = useRouter();
  useOfflineSync();

  // Only ever runs once per cold start/foreground of this component, not on
  // every subsequent navigation - so it doesn't fight with a voluntary
  // retake from Home (by then hasCompletedAssessment is already true) or
  // repeatedly bounce someone actively answering questions on the
  // assessment screen itself.
  const hasCheckedAssessmentGate = useRef(false);

  useEffect(() => {
    if (isBootstrapping || hasCheckedAssessmentGate.current) return;
    hasCheckedAssessmentGate.current = true;
    if (isAuthenticated && user && !user.hasCompletedAssessment) {
      // Into the learner-profile step (not the assessment directly): the
      // profile choice decides whether a test happens at all and at what
      // starting difficulty.
      router.replace("/(onboarding)/profile");
    }
  }, [isBootstrapping, isAuthenticated, user, router]);

  if (isBootstrapping) {
    // Same navy as the native splash background - see the fontsLoaded gate
    // in RootLayout below for why.
    return <View style={{ flex: 1, backgroundColor: colors.ink }} />;
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
  // Failsafe: if font loading neither resolves nor errors within a few
  // seconds (seen as an app frozen on the splash screen), stop waiting and
  // render with system fonts rather than blocking forever - a wrong
  // typeface beats a hung app.
  const [fontTimeoutElapsed, setFontTimeoutElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFontTimeoutElapsed(true), 5000);
    return () => clearTimeout(id);
  }, []);

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

  const fontsReady = fontsLoaded || Boolean(fontError) || fontTimeoutElapsed;

  const onLayoutRootView = useCallback(async () => {
    if (fontsReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    // Splash screen is still visible; render nothing (or a bare loading
    // view as a fallback for platforms where the native splash isn't used).
    // Matches the native splash's backgroundColor (app.json's
    // expo-splash-screen config, colors.ink/#0f172a) so there's no flash of
    // a different color underneath the splash icon before this mounts.
    return <View style={{ flex: 1, backgroundColor: colors.ink }} />;
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
