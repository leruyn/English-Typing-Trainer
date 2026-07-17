import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      initialRouteName="welcome"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="assessment" />
      <Stack.Screen name="complete" />
      <Stack.Screen name="pace" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
