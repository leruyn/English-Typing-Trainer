import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Check, X } from "lucide-react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import { colors } from "../../src/theme";
import type { AssessmentAnswer, CefrTrack } from "@art/shared";
import { generateAssessmentQuestion, submitAssessment } from "../../src/api/endpoints";

/**
 * Small hardcoded question bank spanning 6 difficulty tiers (roughly
 * mirroring A1-C2). Used as the fallback when the AI-generated question
 * endpoint (`POST /assessment/question`, Gemini-backed - see
 * `server/src/routes/assessment.ts`) is unavailable, so a Gemini outage
 * never blocks the entrance assessment.
 */
interface Question {
  difficulty: number; // 1 (easiest) - 6 (hardest)
  prompt: string;
  options: string[];
  correctIndex: number;
}

const QUESTION_BANK: Question[] = [
  { difficulty: 1, prompt: "'Cat' nghĩa là gì?", options: ["Con mèo", "Con chó", "Con chim", "Con cá"], correctIndex: 0 },
  { difficulty: 1, prompt: "'Red' là màu gì?", options: ["Xanh lá", "Đỏ", "Vàng", "Tím"], correctIndex: 1 },
  { difficulty: 1, prompt: "'Three' nghĩa là số mấy?", options: ["Một", "Hai", "Ba", "Bốn"], correctIndex: 2 },
  { difficulty: 2, prompt: "'Kitchen' nghĩa là gì?", options: ["Phòng ngủ", "Nhà bếp", "Phòng khách", "Sân vườn"], correctIndex: 1 },
  { difficulty: 2, prompt: "'Weekend' nghĩa là gì?", options: ["Buổi sáng", "Ngày lễ", "Cuối tuần", "Kỳ nghỉ"], correctIndex: 2 },
  { difficulty: 2, prompt: "Từ nào nghĩa là 'giáo viên'?", options: ["Student", "Doctor", "Teacher", "Farmer"], correctIndex: 2 },
  { difficulty: 3, prompt: "'Environment' nghĩa là gì?", options: ["Môi trường", "Kinh tế", "Xã hội", "Chính trị"], correctIndex: 0 },
  { difficulty: 3, prompt: "'Achieve' nghĩa là gì?", options: ["Từ bỏ", "Đạt được", "Cố gắng", "Chờ đợi"], correctIndex: 1 },
  { difficulty: 3, prompt: "Từ trái nghĩa với 'increase' là?", options: ["Decrease", "Improve", "Expand", "Continue"], correctIndex: 0 },
  { difficulty: 4, prompt: "'Sustainable' nghĩa là gì?", options: ["Tạm thời", "Bền vững", "Đắt đỏ", "Nguy hiểm"], correctIndex: 1 },
  { difficulty: 4, prompt: "'Negotiate' nghĩa là gì?", options: ["Đàm phán", "Từ chối", "Ký kết", "Huỷ bỏ"], correctIndex: 0 },
  { difficulty: 4, prompt: "Từ đồng nghĩa với 'crucial' là?", options: ["Minor", "Essential", "Optional", "Casual"], correctIndex: 1 },
  { difficulty: 5, prompt: "'Ambiguous' nghĩa là gì?", options: ["Rõ ràng", "Mơ hồ", "Chắc chắn", "Đơn giản"], correctIndex: 1 },
  { difficulty: 5, prompt: "'Meticulous' nghĩa là gì?", options: ["Cẩu thả", "Vội vàng", "Tỉ mỉ", "Lười biếng"], correctIndex: 2 },
  { difficulty: 5, prompt: "'Reluctant' nghĩa là gì?", options: ["Hào hứng", "Miễn cưỡng", "Tự tin", "Vui vẻ"], correctIndex: 1 },
  { difficulty: 6, prompt: "'Ubiquitous' nghĩa là gì?", options: ["Hiếm gặp", "Phổ biến khắp nơi", "Bí ẩn", "Lỗi thời"], correctIndex: 1 },
  { difficulty: 6, prompt: "'Ephemeral' nghĩa là gì?", options: ["Vĩnh cửu", "Phù du, thoáng qua", "Chắc chắn", "Rộng lớn"], correctIndex: 1 },
  { difficulty: 6, prompt: "'Pragmatic' nghĩa là gì?", options: ["Lý tưởng hoá", "Thực dụng", "Mơ mộng", "Cảm tính"], correctIndex: 1 },
];

const TOTAL_QUESTIONS = 5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 6;
const START_DIFFICULTY = 3;

function pickQuestion(difficulty: number, askedPrompts: Set<string>): Question {
  const clamped = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, difficulty));
  const candidates = QUESTION_BANK.filter(
    (q) => q.difficulty === clamped && !askedPrompts.has(q.prompt),
  );
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  // Fallback: nearest difficulty tier with an unused question.
  const remaining = QUESTION_BANK.filter((q) => !askedPrompts.has(q.prompt)).sort(
    (a, b) => Math.abs(a.difficulty - clamped) - Math.abs(b.difficulty - clamped),
  );
  return remaining[0] ?? QUESTION_BANK[0];
}

function trackForDifficulty(difficulty: number): CefrTrack {
  if (difficulty <= 2) return "beginner";
  if (difficulty <= 4) return "intermediate";
  return "advanced";
}

const TRAJ_WIDTH = 280;
const TRAJ_HEIGHT = 70;

/**
 * Live SVG line chart of the difficulty trajectory so far, matching the
 * mockup's "Trajectory Tracker" - unlike the mockup (a static demo image),
 * this redraws after every answer since `trajectory` is real state.
 */
function TrajectoryTracker({ trajectory }: { trajectory: number[] }) {
  // Render a flat placeholder line before any question has been answered
  // yet, so the chart has something to show from the very first frame.
  const points = trajectory.length > 0 ? trajectory : [START_DIFFICULTY];
  const stepX = points.length > 1 ? TRAJ_WIDTH / (points.length - 1) : 0;
  const toY = (d: number) =>
    TRAJ_HEIGHT - ((d - MIN_DIFFICULTY) / (MAX_DIFFICULTY - MIN_DIFFICULTY)) * (TRAJ_HEIGHT - 16) - 8;
  const polylinePoints = points.map((d, i) => `${i * stepX},${toY(d)}`).join(" ");

  return (
    <View
      className="rounded-2xl bg-white px-4 py-4"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      <Svg width="100%" height={TRAJ_HEIGHT} viewBox={`0 0 ${TRAJ_WIDTH} ${TRAJ_HEIGHT}`}>
        {points.length > 1 && (
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={colors.indigo}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((d, i) => (
          <Circle
            key={i}
            cx={i * stepX}
            cy={toY(d)}
            r={i === points.length - 1 ? 6 : 5}
            fill={i === points.length - 1 ? colors.emerald500 : colors.indigo}
          />
        ))}
      </Svg>
      <Text
        className="mt-1 text-center text-[11px] text-ink/50"
        style={{ fontFamily: "PlusJakartaSans_500Medium" }}
      >
        Quỹ đạo trả lời (Trajectory Tracker)
      </Text>
    </View>
  );
}

export default function AssessmentScreen() {
  const router = useRouter();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const isRetake = retake === "1";

  const [difficulty, setDifficulty] = useState(START_DIFFICULTY);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [trajectory, setTrajectory] = useState<number[]>([]);
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [askedPrompts, setAskedPrompts] = useState<Set<string>>(new Set());
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);

  // Fetch (or fall back to) one question whenever we advance to a new
  // question index. `difficulty` is intentionally not in the dependency
  // array - it's updated in the same batch as `questionIndex` right before
  // this runs (see handleAnswer), so by the time this effect body executes
  // it already reads the current value; re-running on both would double-fetch.
  useEffect(() => {
    let cancelled = false;
    setLoadingQuestion(true);

    generateAssessmentQuestion({ difficulty, excludePrompts: Array.from(askedPrompts) })
      .then((q) => {
        if (cancelled) return;
        setCurrentQuestion({
          difficulty: q.difficulty,
          prompt: q.prompt,
          options: q.options,
          correctIndex: q.correctIndex,
        });
      })
      .catch(() => {
        // Gemini unavailable/malformed output - fall back to the local
        // static bank so the assessment never gets stuck.
        if (!cancelled) setCurrentQuestion(pickQuestion(difficulty, askedPrompts));
      })
      .finally(() => {
        if (!cancelled) setLoadingQuestion(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withSpring(
          ((difficulty - MIN_DIFFICULTY) / (MAX_DIFFICULTY - MIN_DIFFICULTY)) * 180,
          { damping: 14 },
        ),
      },
    ],
  }));

  function handleAnswer(optionIndex: number) {
    if (selected !== null || !currentQuestion) return;
    setSelected(optionIndex);
    const correct = optionIndex === currentQuestion.correctIndex;
    const nextTrajectory = [...trajectory, currentQuestion.difficulty];
    setTrajectory(nextTrajectory);
    const nextAnswers: AssessmentAnswer[] = [
      ...answers,
      { questionIndex, difficulty: currentQuestion.difficulty, correct },
    ];
    setAnswers(nextAnswers);
    setAskedPrompts((prev) => new Set(prev).add(currentQuestion.prompt));

    const nextDifficulty = correct
      ? Math.min(MAX_DIFFICULTY, difficulty + 1)
      : Math.max(MIN_DIFFICULTY, difficulty - 1);

    setTimeout(() => {
      if (questionIndex + 1 >= TOTAL_QUESTIONS) {
        const suggestedTrack = trackForDifficulty(nextDifficulty);

        // First-time onboarding stashes the answers as route params and only
        // actually POSTs them once the account is created at the end of the
        // flow (see AuthContext.register's `assessmentAnswers`). A retake by
        // an already-registered user has no such later step, so submit the
        // result directly here instead - best-effort, same as the
        // onboarding path (a failed save shouldn't block seeing the result).
        if (isRetake) {
          submitAssessment(nextAnswers).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("Failed to submit retake assessment result:", err);
          });
        }

        router.replace({
          pathname: "/(onboarding)/complete",
          params: {
            trajectory: JSON.stringify(nextTrajectory),
            answers: JSON.stringify(nextAnswers),
            track: suggestedTrack,
            retake: isRetake ? "1" : undefined,
          },
        });
        return;
      }
      setDifficulty(nextDifficulty);
      setQuestionIndex((i) => i + 1);
      setSelected(null);
    }, 550);
  }

  return (
    <View className="flex-1 bg-cream px-6 pt-20 pb-10">
      {/* 5-dot progress indicator */}
      <View className="flex-row items-center justify-center gap-3">
        {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
          <View
            key={i}
            style={{
              width: i === questionIndex ? 14 : 10,
              height: i === questionIndex ? 14 : 10,
              borderRadius: 999,
              backgroundColor:
                i < questionIndex
                  ? colors.emerald500
                  : i === questionIndex
                    ? colors.indigo600
                    : "#e5e0d3",
            }}
          />
        ))}
      </View>

      {/* Difficulty badge / track */}
      <View className="mt-8 items-center">
        <Text
          className="mb-2 text-xs text-ink/50"
          style={{ fontFamily: "Outfit_500Medium" }}
        >
          Độ khó hiện tại
        </Text>
        <View
          style={{
            width: 220,
            height: 28,
            borderRadius: 999,
            backgroundColor: "#efe9db",
            justifyContent: "center",
          }}
        >
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 4,
                width: 32,
                height: 20,
                borderRadius: 999,
                backgroundColor: colors.indigo600,
                alignItems: "center",
                justifyContent: "center",
              },
              badgeStyle,
            ]}
          >
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 11,
                color: "white",
              }}
            >
              {difficulty}
            </Text>
          </Animated.View>
        </View>
      </View>

      {/* Live trajectory tracker */}
      <View className="mt-6">
        <TrajectoryTracker trajectory={trajectory} />
      </View>

      {/* Question card */}
      <View className="mt-6 flex-1">
        {loadingQuestion || !currentQuestion ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color={colors.emerald500} />
            <Text className="mt-3 text-xs text-ink/40" style={{ fontFamily: "Outfit_500Medium" }}>
              Đang tạo câu hỏi...
            </Text>
          </View>
        ) : (
          <>
            <View
              className="rounded-3xl bg-white p-6"
              style={{
                shadowColor: colors.ink,
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Text
                className="text-center text-xl text-ink"
                style={{ fontFamily: "Outfit_600SemiBold" }}
              >
                {currentQuestion.prompt}
              </Text>
            </View>

            {/* 2x2 answer grid */}
            <View className="mt-6 flex-row flex-wrap gap-3">
              {currentQuestion.options.map((option, i) => {
                const isSelected = selected === i;
                const isCorrectOption = i === currentQuestion.correctIndex;
                const showResult = selected !== null;

                let bg = "bg-white";
                let borderColor = "#eee7da";
                if (showResult && isCorrectOption) {
                  bg = "bg-emerald-50";
                  borderColor = colors.emerald500;
                } else if (showResult && isSelected && !isCorrectOption) {
                  bg = "bg-rose-50";
                  borderColor = "#fb7185";
                }

                return (
                  <Pressable
                    key={option}
                    onPress={() => handleAnswer(i)}
                    className={`${bg} basis-[47%] grow items-center justify-center rounded-2xl px-3 py-5`}
                    style={{ borderWidth: 1.5, borderColor, minHeight: 84 }}
                  >
                    <Text
                      className="text-center text-sm text-ink"
                      style={{ fontFamily: "Outfit_500Medium" }}
                    >
                      {option}
                    </Text>
                    {showResult && isCorrectOption && (
                      <View className="mt-1">
                        <Check size={16} color={colors.emerald500} />
                      </View>
                    )}
                    {showResult && isSelected && !isCorrectOption && (
                      <View className="mt-1">
                        <X size={16} color="#e11d48" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      <Text
        className="text-center text-xs text-ink/40"
        style={{ fontFamily: "Outfit" }}
      >
        Câu {questionIndex + 1}/{TOTAL_QUESTIONS}
      </Text>
    </View>
  );
}
