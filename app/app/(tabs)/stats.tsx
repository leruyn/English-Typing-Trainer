import { ScrollView, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flame, Zap } from "lucide-react-native";

import { colors } from "../../src/theme";
import MasteryRing from "../../src/components/MasteryRing";

/**
 * Mock stats data. Real word progress / streak / XP wiring against the
 * backend is a separate later task.
 */
const MOCK = {
  masteryPercent: 62,
  streakDays: 7,
  xp: 1280,
  srsDistribution: [42, 27, 18, 11, 7], // box 1 (new) -> box 5 (mastered)
};

const SRS_COLORS = ["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#059669"];

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const BAR_GAP = 14;

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const maxCount = Math.max(...MOCK.srsDistribution, 1);
  const barWidth = (CHART_WIDTH - BAR_GAP * (MOCK.srsDistribution.length - 1)) / MOCK.srsDistribution.length;

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}
    >
      <Text className="text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
        Thống kê
      </Text>
      <Text className="mt-1 text-sm text-ink/50" style={{ fontFamily: "Outfit" }}>
        Tiến độ học tập của bạn
      </Text>

      {/* Large mastery ring */}
      <View
        className="mt-6 items-center rounded-3xl bg-white py-8"
        style={{
          shadowColor: colors.ink,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <MasteryRing percent={MOCK.masteryPercent} size={168} strokeWidth={16} label="mức độ thành thạo" />
      </View>

      {/* Streak + XP summary cards */}
      <View className="mt-4 flex-row gap-3">
        <View
          className="flex-1 items-center rounded-3xl bg-white py-5"
          style={{
            shadowColor: colors.ink,
            shadowOpacity: 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#fef3c7" }}>
            <Flame size={20} color="#d97706" />
          </View>
          <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 26, color: colors.ink, marginTop: 8 }}>
            {MOCK.streakDays}
          </Text>
          <Text className="text-xs text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
            ngày liên tiếp
          </Text>
        </View>

        <View
          className="flex-1 items-center rounded-3xl bg-white py-5"
          style={{
            shadowColor: colors.ink,
            shadowOpacity: 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#e0e7ff" }}>
            <Zap size={20} color={colors.indigo600} />
          </View>
          <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 26, color: colors.ink, marginTop: 8 }}>
            {MOCK.xp}
          </Text>
          <Text className="text-xs text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
            điểm XP
          </Text>
        </View>
      </View>

      {/* SRS distribution bar chart */}
      <View
        className="mt-4 rounded-3xl bg-white px-5 py-5"
        style={{
          shadowColor: colors.ink,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text className="mb-4 text-sm text-ink/60" style={{ fontFamily: "Outfit_600SemiBold" }}>
          Phân bố hộp SRS
        </Text>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          {MOCK.srsDistribution.map((count, i) => {
            const barHeight = (count / maxCount) * (CHART_HEIGHT - 8);
            const x = i * (barWidth + BAR_GAP);
            const y = CHART_HEIGHT - barHeight;
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={8}
                fill={SRS_COLORS[i]}
              />
            );
          })}
        </Svg>
        <View className="mt-3 flex-row justify-between">
          {MOCK.srsDistribution.map((count, i) => (
            <View key={i} style={{ width: barWidth + BAR_GAP, alignItems: "center" }}>
              <Text className="text-[10px] text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
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
