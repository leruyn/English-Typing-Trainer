import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { BookOpen, Clock, Ear, Eye, Sparkles, Target, Volume2, Zap } from "lucide-react-native";

import type { PracticeMode } from "@art/shared";
import { colors } from "../../src/theme";
import Mascot, { type MascotState } from "../../src/components/Mascot";
import StarBurst, { type StarBurstHandle } from "../../src/components/StarBurst";
import VirtualKeyboard from "../../src/components/VirtualKeyboard";
import { usePracticeQueue } from "../../src/practice/usePracticeQueue";
import { useExplainWord, useProgressQuery, useSubmitAttempt } from "../../src/api/hooks";
import { getSrsBoxMeta } from "../../src/srs";

const MODES: Array<{ key: PracticeMode; label: string; icon: typeof Eye }> = [
  { key: "visual", label: "Visual", icon: Eye },
  { key: "dictation", label: "Dictation", icon: Ear },
  { key: "context", label: "Context", icon: BookOpen },
];

export default function PracticeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: PracticeMode =
    params.mode === "dictation" || params.mode === "context" ? params.mode : "visual";

  const { queue, isLoading } = usePracticeQueue();
  const submitAttempt = useSubmitAttempt();
  const { data: progressData } = useProgressQuery();
  const explainWord = useExplainWord();

  const [mode, setMode] = useState<PracticeMode>(initialMode);
  const [wordIndex, setWordIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [correctPresses, setCorrectPresses] = useState(0);
  const [wrongPresses, setWrongPresses] = useState(0);
  const [totalCharsTyped, setTotalCharsTyped] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mascotState, setMascotState] = useState<MascotState>("neutral");
  const [hasSpoken, setHasSpoken] = useState(false);
  const [wordComplete, setWordComplete] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");

  const starBurstRef = useRef<StarBurstHandle>(null);
  const shakeX = useSharedValue(0);
  const sadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordStartTimeRef = useRef(Date.now());
  const wordWrongCountRef = useRef(0);

  const currentWord = queue.length > 0 ? queue[wordIndex % queue.length] : null;
  // New (never-attempted) words have no progress row yet - the server
  // defaults an unstarted word to box 1 the first time an attempt is
  // recorded (see `server/src/routes/progress.ts`), so mirror that default
  // here rather than showing no box at all.
  const currentBox = currentWord
    ? (progressData?.progress.find((p) => p.wordId === currentWord.id)?.srsBox ?? 1)
    : 1;
  const boxMeta = getSrsBoxMeta(currentBox);

  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setHasSpoken(false);
    wordStartTimeRef.current = Date.now();
    wordWrongCountRef.current = 0;
    // Close/reset the AI panel too - an answer about the previous word
    // shouldn't linger once we've moved on to a new one.
    setAiPanelOpen(false);
    setAiQuestion("");
    explainWord.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordIndex, currentWord?.id]);

  useEffect(() => {
    return () => {
      if (sadTimeout.current) clearTimeout(sadTimeout.current);
    };
  }, []);

  const wpm = useMemo(() => {
    if (totalCharsTyped === 0 || elapsedSeconds === 0) return 0;
    return Math.round((totalCharsTyped / 5) / (elapsedSeconds / 60));
  }, [totalCharsTyped, elapsedSeconds]);

  const accuracy = useMemo(() => {
    const total = correctPresses + wrongPresses;
    if (total === 0) return 100;
    return Math.round((correctPresses / total) * 100);
  }, [correctPresses, wrongPresses]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function goToNextWord() {
    setWordIndex((i) => (queue.length > 0 ? (i + 1) % queue.length : i));
    setTypedCount(0);
    setWordComplete(false);
    setMascotState("neutral");
  }

  function handleKeyPress(char: string, isCorrect: boolean) {
    if (wordComplete || !currentWord) return;

    if (isCorrect) {
      setCorrectPresses((c) => c + 1);
      setTotalCharsTyped((c) => c + 1);
      const nextTypedCount = typedCount + 1;
      setTypedCount(nextTypedCount);

      if (nextTypedCount >= currentWord.text.length) {
        setWordComplete(true);
        setMascotState("happy");
        starBurstRef.current?.burst();

        const timeMs = Math.max(1, Date.now() - wordStartTimeRef.current);
        const totalPresses = currentWord.text.length + wordWrongCountRef.current;
        const attemptAccuracy = Math.round((currentWord.text.length / totalPresses) * 100);
        const attemptWpm = Math.round((currentWord.text.length / 5) / (timeMs / 60000));
        submitAttempt.mutate({
          wordId: currentWord.id,
          mode,
          wpm: attemptWpm,
          accuracyPercent: attemptAccuracy,
          timeMs,
          correct: true,
        });

        setTimeout(goToNextWord, 900);
      }
    } else {
      setWrongPresses((c) => c + 1);
      wordWrongCountRef.current += 1;
      setMascotState("sad");
      shakeX.value = withSequence(
        withTiming(-8, { duration: 40 }),
        withTiming(8, { duration: 40 }),
        withTiming(-6, { duration: 40 }),
        withTiming(6, { duration: 40 }),
        withTiming(0, { duration: 40 }),
      );
      if (sadTimeout.current) clearTimeout(sadTimeout.current);
      sadTimeout.current = setTimeout(() => setMascotState("neutral"), 500);
    }
  }

  function handleBackspace() {
    if (wordComplete) return;
    setTypedCount((c) => Math.max(0, c - 1));
  }

  function handleAskAi() {
    const question = aiQuestion.trim();
    if (!question || !currentWord) return;
    explainWord.mutate({
      word: currentWord.text,
      meaningVi: currentWord.meaningVi,
      exampleSentence: currentWord.exampleSentence,
      question,
    });
  }

  function speakWord() {
    if (!currentWord) return;
    setHasSpoken(true);
    Speech.speak(currentWord.text, { language: "en-US" });
  }

  const nextChar = !currentWord || wordComplete ? undefined : currentWord.text[typedCount]?.toUpperCase();

  if (isLoading || !currentWord) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color={colors.emerald500} />
        <Text className="mt-3 text-sm text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
          Đang tải từ vựng...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {/* Header (fixed) */}
      <View style={{ paddingTop: 56, paddingHorizontal: 20 }}>
        <Text className="text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
          Luyện tập
        </Text>
        <Text className="mt-1 text-xs text-ink/50" style={{ fontFamily: "Outfit" }}>
          {currentWord.topicNameVi}
        </Text>

        {/* Mode selector */}
        <View className="mt-4 flex-row rounded-2xl bg-white p-1.5">
          {MODES.map(({ key, label, icon: Icon }) => {
            const active = mode === key;
            return (
              <Pressable
                key={key}
                onPress={() => setMode(key)}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5"
                style={{ backgroundColor: active ? colors.emerald500 : "transparent" }}
              >
                <Icon size={14} color={active ? "white" : colors.ink} />
                <Text
                  style={{
                    fontFamily: "Outfit_600SemiBold",
                    fontSize: 12,
                    color: active ? "white" : colors.ink,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Scrollable content area */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
      >
        {/* SRS box chip + AI tutor toggle */}
        <View className="mb-3 mt-1 flex-row items-center justify-between">
          <View
            className="flex-row items-center self-start rounded-full px-3 py-1.5"
            style={{ backgroundColor: boxMeta.bg }}
          >
            <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 11, color: boxMeta.fg }}>
              📦 Hộp {currentBox} · {boxMeta.label}
            </Text>
          </View>

          <Pressable
            onPress={() => setAiPanelOpen((open) => !open)}
            className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
            style={{ backgroundColor: aiPanelOpen ? colors.indigo : colors.indigo100 }}
          >
            <Sparkles size={12} color={aiPanelOpen ? "white" : colors.indigo600} />
            <Text
              style={{
                fontFamily: "Outfit_700Bold",
                fontSize: 11,
                color: aiPanelOpen ? "white" : colors.indigo600,
              }}
            >
              Hỏi AI
            </Text>
          </Pressable>
        </View>

        {/* AI vocabulary tutor panel (Gemini) - ask a free-text question
            about the word currently being practiced. */}
        {aiPanelOpen && (
          <View
            className="mb-3 rounded-2xl bg-white px-4 py-3"
            style={{ borderWidth: 1, borderColor: colors.indigo100 }}
          >
            <View className="flex-row items-center gap-2">
              <TextInput
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder={`Hỏi gì đó về "${currentWord.text}"...`}
                placeholderTextColor="#94a3b8"
                style={{ flex: 1, fontFamily: "PlusJakartaSans", fontSize: 13, color: colors.ink }}
                onSubmitEditing={handleAskAi}
                returnKeyType="send"
              />
              <Pressable
                onPress={handleAskAi}
                disabled={explainWord.isPending || aiQuestion.trim().length === 0}
                className="rounded-full px-3 py-1.5"
                style={{
                  backgroundColor: colors.indigo,
                  opacity: explainWord.isPending || aiQuestion.trim().length === 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 11, color: "white" }}>Gửi</Text>
              </Pressable>
            </View>

            {explainWord.isPending && (
              <View className="mt-3 flex-row items-center gap-2">
                <ActivityIndicator size="small" color={colors.indigo} />
                <Text className="text-xs text-ink/40" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
                  AI đang trả lời...
                </Text>
              </View>
            )}
            {explainWord.isError && (
              <Text className="mt-3 text-xs" style={{ fontFamily: "PlusJakartaSans_500Medium", color: colors.rose }}>
                AI hiện không phản hồi được, thử lại sau nhé.
              </Text>
            )}
            {explainWord.data?.answer && (
              <Text
                className="mt-3 text-sm text-ink"
                style={{ fontFamily: "PlusJakartaSans", lineHeight: 19 }}
              >
                {explainWord.data.answer}
              </Text>
            )}
          </View>
        )}

        {/* Stats row */}
        <View className="flex-row gap-3">
          <StatChip icon={Zap} value={`${wpm}`} label="WPM" />
          <StatChip icon={Target} value={`${accuracy}%`} label="Chính xác" />
          <StatChip icon={Clock} value={`${elapsedSeconds}s`} label="Thời gian" />
        </View>

        {/* Mascot + word card */}
        <View className="mt-5 items-center">
          <View style={{ position: "relative" }}>
            <Mascot state={mascotState} size={88} />
            <StarBurst ref={starBurstRef} />
          </View>

          <Animated.View
            style={[
              shakeStyle,
              {
                marginTop: 12,
                width: "100%",
                borderRadius: 24,
                backgroundColor: "white",
                paddingVertical: 24,
                paddingHorizontal: 20,
                alignItems: "center",
                shadowColor: colors.ink,
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
              },
            ]}
          >
            {mode === "visual" && (
              <>
                <Text className="text-xs uppercase text-ink/40" style={{ fontFamily: "Outfit_500Medium" }}>
                  {currentWord.iconHint}
                </Text>
                <Text className="mt-2 text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
                  {currentWord.meaningVi}
                </Text>
                <Text className="mt-1 text-xs text-ink/40" style={{ fontFamily: "Outfit" }}>
                  {currentWord.partOfSpeech}
                </Text>
              </>
            )}

            {mode === "dictation" && (
              <>
                <Pressable
                  onPress={speakWord}
                  className="h-16 w-16 items-center justify-center rounded-full bg-indigo-600"
                >
                  <Volume2 size={26} color="white" />
                </Pressable>
                <Text className="mt-3 text-xs text-ink/50" style={{ fontFamily: "Outfit_500Medium" }}>
                  {hasSpoken ? "Nghe lại và gõ từ" : "Nhấn để nghe từ"}
                </Text>
              </>
            )}

            {mode === "context" && (
              <Text className="text-center text-base text-ink" style={{ fontFamily: "Outfit_500Medium" }}>
                {currentWord.exampleSentence}
              </Text>
            )}

            {/* Letter progress boxes */}
            <View className="mt-6 flex-row flex-wrap justify-center gap-2">
              {currentWord.text.split("").map((letter, i) => {
                const isDone = i < typedCount;
                const isCurrent = i === typedCount && !wordComplete;
                return (
                  <View
                    key={i}
                    style={{
                      width: 28,
                      height: 34,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDone ? "#d1fae5" : "white",
                      borderWidth: 2,
                      borderColor: isDone
                        ? colors.emerald500
                        : isCurrent
                          ? colors.indigo600
                          : "#e5e0d3",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "JetBrainsMono_700Bold",
                        fontSize: 16,
                        color: isDone ? colors.emerald500 : "transparent",
                      }}
                    >
                      {letter.toUpperCase()}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      {/* Docked keyboard */}
      <VirtualKeyboard
        nextChar={nextChar}
        onKeyPress={handleKeyPress}
        onBackspace={handleBackspace}
        disabled={wordComplete}
      />
    </View>
  );
}

function StatChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Zap;
  value: string;
  label: string;
}) {
  return (
    <View
      className="flex-1 items-center rounded-2xl bg-white py-3"
      style={{
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Icon size={14} color={colors.emerald500} />
      <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 16, color: colors.ink, marginTop: 2 }}>
        {value}
      </Text>
      <Text className="text-[10px] text-ink/40" style={{ fontFamily: "Outfit_500Medium" }}>
        {label}
      </Text>
    </View>
  );
}
