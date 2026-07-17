import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flame, Sparkles, Zap } from "lucide-react-native";

import { colors } from "../../src/theme";
import MasteryRing from "../../src/components/MasteryRing";
import SrsBoxList from "../../src/components/SrsBoxList";
import { useCoachingQuery, useStatsQuery } from "../../src/api/hooks";

const HEATMAP_COLUMNS = 12;
const HEATMAP_ROWS = 7;

/** Discrete color steps for the activity heatmap, from "no practice" to "heavy practice day". */
function heatColor(count: number): string {
  if (count <= 0) return colors.cream2;
  if (count <= 2) return "#a7f3d0";
  if (count <= 5) return colors.emerald500;
  return colors.emerald600;
}

function ActivityHeatmap({ activity }: { activity: number[] }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 10,
        gap: 4,
      }}
    >
      {activity.map((count, i) => (
        <View
          key={i}
          style={{
            width: `${100 / HEATMAP_COLUMNS - 0.6}%`,
            aspectRatio: 1,
            borderRadius: 3,
            backgroundColor: heatColor(count),
          }}
        />
      ))}
    </View>
  );
}

function WeeklyBarChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <View className="mt-3 flex-row items-end" style={{ height: 100, gap: 8 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
          <View
            style={{
              height: `${Math.max(4, (v / max) * 100)}%`,
              borderRadius: 6,
              backgroundColor: colors.indigo,
            }}
          />
          <Text
            className="mt-1 text-center text-[10px] text-ink/50"
            style={{ fontFamily: "PlusJakartaSans_500Medium" }}
          >
            {i === values.length - 1 ? "Tuần này" : `T-${values.length - 1 - i}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { data: stats } = useStatsQuery();
  const { data: coaching, isLoading: coachingLoading } = useCoachingQuery();

  const masteryPercent = stats?.masteryPercent ?? 0;
  const streakDays = stats?.currentStreak ?? 0;
  const xp = stats?.totalXp ?? 0;
  const boxDistribution = stats?.boxDistribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const activity = stats?.activityLast12Weeks ?? new Array(HEATMAP_COLUMNS * HEATMAP_ROWS).fill(0);
  const wordsPerWeek = stats?.wordsPerWeek ?? new Array(7).fill(0);

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}
    >
      <Text className="text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
        Thống kê
      </Text>
      <Text className="mt-1 text-sm text-ink/50" style={{ fontFamily: "PlusJakartaSans" }}>
        Tiến độ học tập của bạn
      </Text>

      {/* Large mastery ring */}
      <View
        className="mt-6 items-center rounded-3xl bg-white py-8"
        style={{ borderWidth: 1, borderColor: colors.border }}
      >
        <MasteryRing percent={masteryPercent} size={168} strokeWidth={16} label="mức độ thành thạo" />
      </View>

      {/* Streak + XP summary cards */}
      <View className="mt-4 flex-row gap-3">
        <View
          className="flex-1 items-center rounded-3xl bg-white py-5"
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.amber100 }}>
            <Flame size={20} color={colors.amber600} />
          </View>
          <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 26, color: colors.ink, marginTop: 8 }}>
            {streakDays}
          </Text>
          <Text className="text-xs text-ink/50" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
            ngày liên tiếp
          </Text>
        </View>

        <View
          className="flex-1 items-center rounded-3xl bg-white py-5"
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.indigo100 }}>
            <Zap size={20} color={colors.indigo600} />
          </View>
          <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 26, color: colors.ink, marginTop: 8 }}>
            {xp}
          </Text>
          <Text className="text-xs text-ink/50" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
            điểm XP
          </Text>
        </View>
      </View>

      {/* AI coaching note (Gemini) - hidden entirely while loading or on
          failure (e.g. Gemini outage) rather than showing an error state;
          this is a nice-to-have insight, not something the screen depends on. */}
      {coachingLoading ? (
        <View
          className="mt-4 flex-row items-center gap-3 rounded-3xl bg-white px-5 py-4"
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <ActivityIndicator color={colors.indigo} size="small" />
          <Text className="text-xs text-ink/40" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
            AI đang phân tích tiến trình của bạn...
          </Text>
        </View>
      ) : coaching?.message ? (
        <View
          className="mt-4 rounded-3xl px-5 py-4"
          style={{ backgroundColor: colors.indigo100, borderWidth: 1, borderColor: colors.indigo100 }}
        >
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={14} color={colors.indigo600} />
            <Text
              className="text-[11px]"
              style={{ fontFamily: "PlusJakartaSans_700Bold", color: colors.indigo600, textTransform: "uppercase", letterSpacing: 0.4 }}
            >
              Nhận xét từ AI
            </Text>
          </View>
          <Text className="mt-1.5 text-sm text-ink" style={{ fontFamily: "PlusJakartaSans_500Medium", lineHeight: 20 }}>
            {coaching.message}
          </Text>
        </View>
      ) : null}

      {/* 5 SRS memory boxes */}
      <Text
        className="ml-0.5 mt-6 text-xs text-ink/60"
        style={{ fontFamily: "PlusJakartaSans_700Bold", textTransform: "uppercase", letterSpacing: 0.6 }}
      >
        5 Hộp ký ức SRS
      </Text>
      <View className="mt-2">
        <SrsBoxList distribution={boxDistribution} />
      </View>

      {/* Activity heatmap */}
      <View
        className="mt-6 rounded-3xl bg-white px-5 py-5"
        style={{ borderWidth: 1, borderColor: colors.border }}
      >
        <Text className="text-sm text-ink/70" style={{ fontFamily: "Outfit_700Bold" }}>
          Hoạt động 12 tuần qua
        </Text>
        <ActivityHeatmap activity={activity} />
      </View>

      {/* Weekly words-practiced trend */}
      <View
        className="mt-4 rounded-3xl bg-white px-5 py-5"
        style={{ borderWidth: 1, borderColor: colors.border }}
      >
        <Text className="text-sm text-ink/70" style={{ fontFamily: "Outfit_700Bold" }}>
          Từ luyện tập theo tuần
        </Text>
        <WeeklyBarChart values={wordsPerWeek} />
      </View>
    </ScrollView>
  );
}
