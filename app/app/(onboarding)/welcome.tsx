import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { Repeat, Keyboard, WifiOff } from "lucide-react-native";

import { colors } from "../../src/theme";
import Mascot from "../../src/components/Mascot";

const FEATURES = [
  { icon: Repeat, label: "SRS 5 hộp" },
  { icon: Keyboard, label: "Gõ phản xạ" },
  { icon: WifiOff, label: "Offline" },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-cream px-6 pt-20 pb-10">
      <View className="flex-1 items-center justify-center">
        <Mascot state="happy" size={128} />

        <Text
          className="mt-8 text-center text-4xl text-ink"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          Active Recall
        </Text>
        <Text
          className="text-center text-4xl text-emerald-500"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          English Typer
        </Text>

        <Text
          className="mt-4 max-w-xs text-center text-base text-ink/70"
          style={{ fontFamily: "Outfit" }}
        >
          Học từ vựng tiếng Anh bằng cách gõ lại — phản xạ nhanh, nhớ lâu.
        </Text>

        <View className="mt-8 flex-row flex-wrap items-center justify-center gap-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <View
              key={label}
              className="flex-row items-center gap-1.5 rounded-full bg-white px-3.5 py-2"
              style={{
                borderWidth: 1,
                borderColor: "#eee7da",
                shadowColor: colors.ink,
                shadowOpacity: 0.05,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <Icon size={15} color={colors.emerald500} />
              <Text
                className="text-xs text-ink"
                style={{ fontFamily: "Outfit_500Medium" }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-4">
        <Pressable
          onPress={() => router.push("/(onboarding)/assessment")}
          className="items-center rounded-2xl bg-emerald-500 py-4"
          style={{
            shadowColor: colors.emerald500,
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Text
            className="text-base text-white"
            style={{ fontFamily: "Outfit_600SemiBold" }}
          >
            Bắt đầu khảo sát trình độ
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(tabs)/home")}
          className="items-center py-2"
        >
          <Text
            className="text-sm text-ink/60"
            style={{ fontFamily: "Outfit_500Medium", textDecorationLine: "underline" }}
          >
            Bỏ qua, khám phá luôn
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
