import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Check, Volume2, X } from "lucide-react-native";
import * as Speech from "expo-speech";
import Svg, { Circle, Polyline } from "react-native-svg";

import { colors } from "../../src/theme";
import type { AssessmentAnswer, AssessmentItemType, CefrTrack, LearnerGroup } from "@art/shared";
import { generateAssessmentQuestion, submitAssessment } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";

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

// Raised from 5 to 8: the original suggestTrack() heuristic only looked at
// the last two answers, so 5 questions was plenty; the new weighted-average
// heuristic (server/src/routes/assessment.ts) uses every answer, and more
// data points make that average converge on the learner's real level more
// reliably.
const TOTAL_QUESTIONS = 8;

/**
 * Which item type each of the 8 slots uses. Half the test is typed
 * production ("nghe rồi gõ" dictation + "nhìn nghĩa gõ từ" recall) because
 * 4-option MCQ succeeds 25% of the time by pure guessing - a child tapping
 * randomly can look B1 on an all-MCQ test - while a typed answer can't be
 * guessed and measures the exact skill this app trains. The server weights
 * typed answers 2x in the placement heuristic for the same reason.
 * MCQ slots come first so the (AI-generated, slower to load) questions
 * front-load while the user is fresh, and the harder production items
 * arrive once they're warmed up.
 */
const ITEM_TYPE_BY_INDEX: AssessmentItemType[] = [
  "mcq",
  "mcq",
  "dictation",
  "mcq",
  "recall",
  "mcq",
  "dictation",
  "recall",
];

/**
 * Static bank for typed items, ~4 words per difficulty tier, drawn from
 * the same CEFR tiers the app's vocabulary uses. Deliberately NOT
 * AI-generated: a typed item needs a guaranteed-unambiguous correct answer
 * (exact spelling), and these double as difficulty anchors that no model
 * drift can shift.
 */
const TYPED_BANK: Record<number, Array<{ word: string; meaningVi: string }>> = {
  1: [
    { word: "dog", meaningVi: "con chó" },
    { word: "milk", meaningVi: "sữa" },
    { word: "sun", meaningVi: "mặt trời" },
    { word: "book", meaningVi: "quyển sách" },
  ],
  2: [
    { word: "window", meaningVi: "cửa sổ" },
    { word: "breakfast", meaningVi: "bữa sáng" },
    { word: "market", meaningVi: "chợ" },
    { word: "family", meaningVi: "gia đình" },
  ],
  3: [
    { word: "moment", meaningVi: "khoảnh khắc" },
    { word: "improve", meaningVi: "cải thiện" },
    { word: "journey", meaningVi: "chuyến đi, hành trình" },
    { word: "protect", meaningVi: "bảo vệ" },
  ],
  4: [
    { word: "efficient", meaningVi: "hiệu quả" },
    { word: "guarantee", meaningVi: "bảo đảm, cam kết" },
    { word: "colleague", meaningVi: "đồng nghiệp" },
    { word: "emphasize", meaningVi: "nhấn mạnh" },
  ],
  5: [
    { word: "phenomenon", meaningVi: "hiện tượng" },
    { word: "deliberate", meaningVi: "có chủ ý, cố tình" },
    { word: "inevitable", meaningVi: "không thể tránh khỏi" },
    { word: "perceive", meaningVi: "nhận thức, cảm nhận" },
  ],
  6: [
    { word: "meticulous", meaningVi: "tỉ mỉ, kỹ lưỡng" },
    { word: "ambiguous", meaningVi: "mơ hồ, nước đôi" },
    { word: "resilient", meaningVi: "kiên cường, bền bỉ" },
    { word: "scrutinize", meaningVi: "xem xét kỹ lưỡng" },
  ],
};

/** Pick an unused typed-bank entry at (or nearest to) the given difficulty. */
function pickTypedEntry(
  difficulty: number,
  usedWords: Set<string>,
): { word: string; meaningVi: string; difficulty: number } {
  const clamped = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, difficulty));
  // Walk outward from the target tier (same tier first, then ±1, ±2...) so
  // a exhausted tier degrades to the nearest difficulty, not a random one.
  for (let delta = 0; delta <= MAX_DIFFICULTY; delta += 1) {
    for (const tier of [clamped - delta, clamped + delta]) {
      const entries = TYPED_BANK[tier];
      if (!entries) continue;
      const available = entries.filter((e) => !usedWords.has(e.word));
      if (available.length > 0) {
        const chosen = available[Math.floor(Math.random() * available.length)];
        return { ...chosen, difficulty: tier };
      }
    }
  }
  // Every word in the bank used (impossible with 8 questions vs 24 words,
  // but keep a total fallback anyway).
  return { ...TYPED_BANK[clamped][0], difficulty: clamped };
}

/**
 * Normalizes a typed answer for comparison: case, surrounding whitespace,
 * and internal double-spaces don't count as spelling errors.
 */
function normalizeTyped(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
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
  const { updateUser } = useAuth();
  // Seeded by the learner-profile step: `start` sets the initial
  // difficulty (an adult self-rated "khá/giỏi" starts at 4 instead of
  // grinding up from mid-scale), `group` is forwarded with the final
  // submit. A retake from Home arrives with no params - defaults apply.
  const { group, start } = useLocalSearchParams<{ group?: string; start?: string }>();
  const learnerGroup: LearnerGroup | undefined =
    group === "child" || group === "student" || group === "adult" ? group : undefined;
  const parsedStart = start ? Number.parseInt(start, 10) : NaN;
  const initialDifficulty = Number.isInteger(parsedStart)
    ? Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, parsedStart))
    : START_DIFFICULTY;

  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [trajectory, setTrajectory] = useState<number[]>([]);
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [askedPrompts, setAskedPrompts] = useState<Set<string>>(new Set());
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);

  // Typed-item (dictation/recall) state. `typedUsedWords` is a ref, not
  // state: it only guards against repeats and never drives a render.
  const itemType: AssessmentItemType = ITEM_TYPE_BY_INDEX[questionIndex] ?? "mcq";
  const [typedItem, setTypedItem] = useState<{
    word: string;
    meaningVi: string;
    difficulty: number;
  } | null>(null);
  const [typedInput, setTypedInput] = useState("");
  const [typedResult, setTypedResult] = useState<"correct" | "wrong" | null>(null);
  const typedUsedWords = useRef<Set<string>>(new Set());

  // Prepare one item whenever we advance to a new question index: MCQ slots
  // fetch from the AI endpoint (falling back to the static bank), typed
  // slots draw synchronously from TYPED_BANK. `difficulty` is intentionally
  // not in the dependency array - it's updated in the same batch as
  // `questionIndex` right before this runs (see the answer handlers), so by
  // the time this effect body executes it already reads the current value;
  // re-running on both would double-fetch.
  useEffect(() => {
    if (ITEM_TYPE_BY_INDEX[questionIndex] !== "mcq") {
      const entry = pickTypedEntry(difficulty, typedUsedWords.current);
      typedUsedWords.current.add(entry.word);
      setTypedItem(entry);
      setTypedInput("");
      setTypedResult(null);
      setLoadingQuestion(false);
      // Dictation plays the word immediately - the learner's task starts
      // with hearing it, not with hunting for a play button.
      if (ITEM_TYPE_BY_INDEX[questionIndex] === "dictation") {
        Speech.speak(entry.word, { language: "en-US", rate: 0.9 });
      }
      return;
    }

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

  /**
   * Records one answered item (from either handler below), then advances to
   * the next question - or, on the last one, submits the whole result and
   * moves to the completion screen.
   */
  function recordAnswer(params: {
    correct: boolean;
    answeredDifficulty: number;
    answeredItemType: AssessmentItemType;
  }) {
    const { correct, answeredDifficulty, answeredItemType } = params;

    const nextTrajectory = [...trajectory, answeredDifficulty];
    setTrajectory(nextTrajectory);
    const nextAnswers: AssessmentAnswer[] = [
      ...answers,
      { questionIndex, itemType: answeredItemType, difficulty: answeredDifficulty, correct },
    ];
    setAnswers(nextAnswers);

    const nextDifficulty = correct
      ? Math.min(MAX_DIFFICULTY, difficulty + 1)
      : Math.max(MIN_DIFFICULTY, difficulty - 1);

    setTimeout(async () => {
      if (questionIndex + 1 >= TOTAL_QUESTIONS) {
        // Local fallback estimate in case the submit below fails (offline,
        // Gemini/server hiccup) - the accurate value is whatever the server
        // computes via its weighted-average suggestTrack(), which we prefer
        // once the request succeeds.
        let suggestedTrack = trackForDifficulty(nextDifficulty);

        // This screen always runs in an authenticated context (account
        // creation/login happens first - see (onboarding)/account.tsx), so
        // the result can always be submitted directly. Best-effort: a
        // failed save shouldn't block the learner from seeing their result
        // and moving on.
        try {
          const result = await submitAssessment(nextAnswers, learnerGroup);
          suggestedTrack = result.suggestedTrack;
          await updateUser({
            hasCompletedAssessment: true,
            currentTrack: result.currentTrack,
            ...(learnerGroup ? { learnerGroup } : {}),
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Failed to submit assessment result:", err);
        }

        router.replace({
          pathname: "/(onboarding)/complete",
          params: {
            trajectory: JSON.stringify(nextTrajectory),
            track: suggestedTrack,
          },
        });
        return;
      }
      setDifficulty(nextDifficulty);
      setQuestionIndex((i) => i + 1);
      setSelected(null);
    }, 550);
  }

  function handleAnswer(optionIndex: number) {
    if (selected !== null || !currentQuestion) return;
    setSelected(optionIndex);
    setAskedPrompts((prev) => new Set(prev).add(currentQuestion.prompt));
    recordAnswer({
      correct: optionIndex === currentQuestion.correctIndex,
      answeredDifficulty: currentQuestion.difficulty,
      answeredItemType: "mcq",
    });
  }

  function handleTypedSubmit() {
    if (typedResult !== null || !typedItem || typedInput.trim().length === 0) return;
    const correct = normalizeTyped(typedInput) === normalizeTyped(typedItem.word);
    setTypedResult(correct ? "correct" : "wrong");
    recordAnswer({
      correct,
      answeredDifficulty: typedItem.difficulty,
      answeredItemType: itemType === "dictation" ? "dictation" : "recall",
    });
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
        {itemType !== "mcq" && typedItem ? (
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
              {itemType === "dictation" ? (
                <>
                  <Text
                    className="text-center text-sm text-ink/60"
                    style={{ fontFamily: "Outfit_500Medium" }}
                  >
                    Nghe và gõ lại từ tiếng Anh
                  </Text>
                  <Pressable
                    onPress={() =>
                      Speech.speak(typedItem.word, { language: "en-US", rate: 0.9 })
                    }
                    className="mt-4 flex-row items-center justify-center gap-2 self-center rounded-full bg-indigo-600 px-6 py-3"
                  >
                    <Volume2 size={18} color="white" />
                    <Text className="text-sm text-white" style={{ fontFamily: "Outfit_600SemiBold" }}>
                      Nghe lại
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text
                    className="text-center text-sm text-ink/60"
                    style={{ fontFamily: "Outfit_500Medium" }}
                  >
                    Gõ từ tiếng Anh có nghĩa là
                  </Text>
                  <Text
                    className="mt-2 text-center text-xl text-ink"
                    style={{ fontFamily: "Outfit_700Bold" }}
                  >
                    “{typedItem.meaningVi}”
                  </Text>
                </>
              )}
            </View>

            <View className="mt-6">
              <TextInput
                value={typedInput}
                onChangeText={setTypedInput}
                editable={typedResult === null}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                onSubmitEditing={handleTypedSubmit}
                placeholder="Gõ từ tiếng Anh..."
                placeholderTextColor="#94a3b8"
                className="rounded-2xl bg-white px-5 py-4"
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 18,
                  color: colors.ink,
                  borderWidth: 1.5,
                  borderColor:
                    typedResult === "correct"
                      ? colors.emerald500
                      : typedResult === "wrong"
                        ? "#fb7185"
                        : colors.border,
                  textAlign: "center",
                }}
              />

              {typedResult === null ? (
                <Pressable
                  onPress={handleTypedSubmit}
                  disabled={typedInput.trim().length === 0}
                  className="mt-4 items-center rounded-2xl bg-emerald-500 py-3.5"
                  style={{ opacity: typedInput.trim().length === 0 ? 0.4 : 1 }}
                >
                  <Text className="text-base text-white" style={{ fontFamily: "Outfit_600SemiBold" }}>
                    Trả lời
                  </Text>
                </Pressable>
              ) : (
                <View className="mt-4 flex-row items-center justify-center gap-2">
                  {typedResult === "correct" ? (
                    <Check size={18} color={colors.emerald500} />
                  ) : (
                    <X size={18} color="#e11d48" />
                  )}
                  <Text
                    className="text-sm text-ink/70"
                    style={{ fontFamily: "JetBrainsMono_500Medium" }}
                  >
                    {typedResult === "correct" ? "Chính xác!" : `Đáp án: ${typedItem.word}`}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : loadingQuestion || !currentQuestion ? (
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
