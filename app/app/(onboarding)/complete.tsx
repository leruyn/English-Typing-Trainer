import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { Award, Sparkles, TrendingUp } from "lucide-react-native";

import { colors } from "../../src/theme";
import type { CefrTrack } from "@art/shared";

const TRACK_LABEL: Record<CefrTrack, string> = {
  beginner: "Beginner (A1-A2)",
  intermediate: "Intermediate (B1-B2)",
  advanced: "Advanced (C1-C2)",
};

const TRACK_DESCRIPTION: Record<CefrTrack, string> = {
  beginner: "Bắt đầu với từ vựng nền tảng, giao tiếp hằng ngày.",
  intermediate: "Từ vựng chủ đề công việc, xã hội, học thuật cơ bản.",
  advanced: "Từ vựng học thuật, sắc thái nghĩa, văn phong nâng cao.",
};

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 6;

export default function OnboardingCompleteScreen() {
  const router = useRouter();
  const { trajectory: trajectoryParam, track: trackParam } = useLocalSearchParams<{
    trajectory?: string;
    track?: string;
  }>();

  let trajectory: number[] = [];
  try {
    trajectory = trajectoryParam ? JSON.parse(trajectoryParam) : [];
  } catch {
    trajectory = [];
  }
  const suggestedTrack: CefrTrack =
    trackParam === "beginner" || trackParam === "intermediate" || trackParam === "advanced"
      ? trackParam
      : "beginner";

  const points = trajectory.length > 0 ? trajectory : [3, 3, 3, 3, 3, 3, 3, 3];
  const stepX = CHART_WIDTH / Math.max(1, points.length - 1);
  const toY = (difficulty: number) =>
    CHART_HEIGHT -
    ((difficulty - MIN_DIFFICULTY) / (MAX_DIFFICULTY - MIN_DIFFICULTY)) * (CHART_HEIGHT - 16) -
    8;

  const polylinePoints = points.map((d, i) => `${i * stepX},${toY(d)}`).join(" ");

  return (
    <View className="flex-1 bg-cream px-6 pt-20 pb-10">
      <View className="items-center">
        <View
          className="h-16 w-16 items-center justify-center rounded-full bg-emerald-500"
          style={{
            shadowColor: colors.emerald500,
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Sparkles size={28} color="white" />
        </View>
        <Text
          className="mt-5 text-center text-2xl text-ink"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          Hoàn thành khảo sát!
        </Text>
        <Text
          className="mt-2 text-center text-sm text-ink/60"
          style={{ fontFamily: "Outfit" }}
        >
          Đây là hành trình độ khó của bạn qua {points.length} câu hỏi
        </Text>
      </View>

      {/* Difficulty trajectory sparkline */}
      <View
        className="mt-8 items-center rounded-3xl bg-white p-5"
        style={{
          shadowColor: colors.ink,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View className="mb-3 flex-row items-center gap-1.5 self-start">
          <TrendingUp size={16} color={colors.indigo600} />
          <Text
            className="text-xs text-ink/60"
            style={{ fontFamily: "Outfit_500Medium" }}
          >
            Độ khó qua từng câu
          </Text>
        </View>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Line
            x1={0}
            y1={CHART_HEIGHT - 8}
            x2={CHART_WIDTH}
            y2={CHART_HEIGHT - 8}
            stroke="#eee7da"
            strokeWidth={1}
          />
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={colors.indigo600}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((d, i) => (
            <Circle
              key={i}
              cx={i * stepX}
              cy={toY(d)}
              r={5}
              fill={colors.emerald500}
              stroke="white"
              strokeWidth={2}
            />
          ))}
        </Svg>
      </View>

      {/* Suggested track card */}
      <View
        className="mt-5 rounded-3xl bg-white p-5"
        style={{
          borderWidth: 1.5,
          borderColor: colors.emerald500,
        }}
      >
        <View className="flex-row items-center gap-2">
          <Award size={20} color={colors.emerald500} />
          <Text
            className="text-xs text-emerald-600"
            style={{ fontFamily: "Outfit_600SemiBold" }}
          >
            LỘ TRÌNH ĐỀ XUẤT
          </Text>
        </View>
        <Text
          className="mt-2 text-lg text-ink"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          {TRACK_LABEL[suggestedTrack]}
        </Text>
        <Text
          className="mt-1 text-sm text-ink/60"
          style={{ fontFamily: "Outfit" }}
        >
          {TRACK_DESCRIPTION[suggestedTrack]}
        </Text>
      </View>

      <View className="flex-1" />

      {/* Account creation and minutesPerDay are both already settled by the
          time this screen is reached (account.tsx now runs before the
          assessment - see app/_layout.tsx's routing gate), and the result
          was already submitted in assessment.tsx, so there's nothing left
          to do but go to the home tabs, whether this was first-time
          onboarding or a voluntary retake from Home. */}
      <Pressable
        onPress={() => router.replace("/(tabs)/home")}
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
          Về trang chủ
        </Text>
      </Pressable>
    </View>
  );
}
