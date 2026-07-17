import { ScrollView, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flame, Zap } from "lucide-react-native";

import { colors } from "../../src/theme";
import MasteryRing from "../../src/components/MasteryRing";
import { useStatsQuery } from "../../src/api/hooks";

const SRS_COLORS = ["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#059669"];

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const BAR_GAP = 14;

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { data: stats } = useStatsQuery();

  const masteryPercent = stats?.masteryPercent ?? 0;
  const streakDays = stats?.currentStreak ?? 0;
  const xp = stats?.totalXp ?? 0;
  const srsDistribution = [1, 2, 3, 4, 5].map((box) => stats?.boxDistribution[box as 1 | 2 | 3 | 4 | 5] ?? 0);

  const maxCount = Math.max(...srsDistribution, 1);
  const barWidth = (CHART_WIDTH - BAR_GAP * (srsDistribution.length - 1)) / srsDistribution.length;

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
        <MasteryRing percent={masteryPercent} size={168} strokeWidth={16} label="mức độ thành thạo" />
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
            {streakDays}
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
            {xp}
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
          {srsDistribution.map((count, i) => {
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
          {srsDistribution.map((count, i) => (
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
