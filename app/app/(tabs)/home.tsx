import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookOpen, ChevronRight, Ear, Eye, Flame, Zap } from "lucide-react-native";

import { colors } from "../../src/theme";
import MasteryRing from "../../src/components/MasteryRing";

/**
 * Mock dashboard data. Real word progress / streak / XP wiring against the
 * backend + TanStack Query is a separate later task — see project notes.
 */
const MOCK = {
  masteryPercent: 62,
  streakDays: 7,
  xp: 1280,
  srsDistribution: [42, 27, 18, 11, 7], // box 1 (new) -> box 5 (mastered)
};

const SRS_COLORS = ["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#059669"];

const PRACTICE_MODES = [
  {
    key: "visual",
    label: "Visual",
    description: "Xem hình, gõ từ",
    icon: Eye,
    tint: "#10b981",
  },
  {
    key: "dictation",
    label: "Dictation",
    description: "Nghe và gõ lại",
    icon: Ear,
    tint: "#4f46e5",
  },
  {
    key: "context",
    label: "Context",
    description: "Điền từ vào câu",
    icon: BookOpen,
    tint: "#d97706",
  },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: 32,
      }}
    >
      <Text className="text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
        Chào mừng trở lại
      </Text>
      <Text className="mt-1 text-sm text-ink/50" style={{ fontFamily: "Outfit" }}>
        Cùng luyện tập từ vựng hôm nay nhé
      </Text>

      {/* Bento row 1: mastery ring + streak/xp stack */}
      <View className="mt-5 flex-row gap-3">
        <View
          className="flex-1 items-center justify-center rounded-3xl bg-white py-6"
          style={{
            shadowColor: colors.ink,
            shadowOpacity: 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <MasteryRing percent={MOCK.masteryPercent} size={104} label="mastery" />
        </View>

        <View className="flex-1 gap-3">
          <View
            className="flex-1 flex-row items-center gap-3 rounded-3xl bg-white px-4 py-4"
            style={{
              shadowColor: colors.ink,
              shadowOpacity: 0.06,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "#fef3c7" }}>
              <Flame size={18} color="#d97706" />
            </View>
            <View>
              <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 20, color: colors.ink }}>
                {MOCK.streakDays}
              </Text>
              <Text className="text-xs text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
                ngày liên tiếp
              </Text>
            </View>
          </View>

          <View
            className="flex-1 flex-row items-center gap-3 rounded-3xl bg-white px-4 py-4"
            style={{
              shadowColor: colors.ink,
              shadowOpacity: 0.06,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "#e0e7ff" }}>
              <Zap size={18} color={colors.indigo600} />
            </View>
            <View>
              <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 20, color: colors.ink }}>
                {MOCK.xp}
              </Text>
              <Text className="text-xs text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
                điểm XP
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Practice mode cards */}
      <Text className="mb-3 mt-6 text-sm text-ink/60" style={{ fontFamily: "Outfit_600SemiBold" }}>
        Chế độ luyện tập
      </Text>
      <View className="gap-3">
        {PRACTICE_MODES.map(({ key, label, description, icon: Icon, tint }) => (
          <Pressable
            key={key}
            onPress={() => router.push({ pathname: "/(tabs)/practice", params: { mode: key } })}
            className="flex-row items-center rounded-2xl bg-white px-4 py-4"
            style={{
              shadowColor: colors.ink,
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            <View
              className="h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${tint}1a` }}
            >
              <Icon size={20} color={tint} />
            </View>
            <View className="ml-3 flex-1">
              <Text style={{ fontFamily: "Outfit_600SemiBold", fontSize: 15, color: colors.ink }}>
                {label}
              </Text>
              <Text className="text-xs text-ink/50" style={{ fontFamily: "Outfit" }}>
                {description}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.ink} opacity={0.3} />
          </Pressable>
        ))}
      </View>

      {/* Time Attack banner */}
      <Pressable
        onPress={() => router.push("/(tabs)/time-attack")}
        className="mt-6 overflow-hidden rounded-3xl px-5 py-6"
        style={{ backgroundColor: colors.ink }}
      >
        <View className="flex-row items-center gap-2">
          <Zap size={18} color="#fbbf24" fill="#fbbf24" />
          <Text style={{ fontFamily: "Outfit_600SemiBold", fontSize: 12, color: "#fbbf24" }}>
            TIME ATTACK
          </Text>
        </View>
        <Text className="mt-2 text-lg text-white" style={{ fontFamily: "Outfit_700Bold" }}>
          Gõ càng nhanh, điểm càng cao
        </Text>
        <Text className="mt-1 text-sm text-white/60" style={{ fontFamily: "Outfit" }}>
          Thử thách 45 giây — sẵn sàng chưa?
        </Text>
      </Pressable>

      {/* SRS distribution bar */}
      <View
        className="mt-6 rounded-3xl bg-white px-5 py-5"
        style={{
          shadowColor: colors.ink,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text className="mb-3 text-sm text-ink/60" style={{ fontFamily: "Outfit_600SemiBold" }}>
          Phân bố hộp SRS
        </Text>
        <View className="flex-row overflow-hidden rounded-full" style={{ height: 16 }}>
          {MOCK.srsDistribution.map((count, i) => (
            <View
              key={i}
              style={{
                flex: Math.max(count, 1),
                backgroundColor: SRS_COLORS[i],
              }}
            />
          ))}
        </View>
        <View className="mt-3 flex-row justify-between">
          {MOCK.srsDistribution.map((count, i) => (
            <View key={i} className="items-center">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SRS_COLORS[i] }}
              />
              <Text className="mt-1 text-[10px] text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
                Box {i + 1}
              </Text>
              <Text style={{ fontFamily: "JetBrainsMono_500Medium", fontSize: 11, color: colors.ink }}>
                {count}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
