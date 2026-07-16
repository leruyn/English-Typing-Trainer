import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Flame, Hash, Play, Zap } from "lucide-react-native";

import { colors } from "../../src/theme";
import Mascot, { type MascotState } from "../../src/components/Mascot";
import StarBurst, { type StarBurstHandle } from "../../src/components/StarBurst";
import VirtualKeyboard from "../../src/components/VirtualKeyboard";
import beginnerVocabJson from "../../../packages/shared/data/vocab/beginner.json";

interface VocabTopic {
  topicId: string;
  topicNameVi: string;
  cefrLevel: string;
  words: Array<{ word: string; pos: string; meaningVi: string; exampleSentence: string; iconHint: string }>;
}

const beginnerVocab = beginnerVocabJson as VocabTopic[];
const WORDS = beginnerVocab.flatMap((topic) => topic.words.map((w) => w.word));

const ROUND_SECONDS = 45;
const CORRECT_WORD_BONUS_SECONDS = 3;
const WRONG_CHAR_PENALTY_SECONDS = 1;
const LOW_TIME_THRESHOLD = 10;

function shuffledWords(): string[] {
  const copy = [...WORDS];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function TimeAttackScreen() {
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [queue, setQueue] = useState<string[]>(() => shuffledWords());
  const [wordIndex, setWordIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [charsTyped, setCharsTyped] = useState(0);
  const [mascotState, setMascotState] = useState<MascotState>("neutral");
  const [gameOver, setGameOver] = useState(false);

  const starBurstRef = useRef<StarBurstHandle>(null);
  const shakeX = useSharedValue(0);
  const sadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentWord = queue[wordIndex % queue.length] ?? "";

  useEffect(() => {
    if (!running) return;
    if (secondsLeft <= 0) {
      setRunning(false);
      setGameOver(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, secondsLeft]);

  useEffect(() => {
    return () => {
      if (sadTimeout.current) clearTimeout(sadTimeout.current);
    };
  }, []);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function startGame() {
    setQueue(shuffledWords());
    setWordIndex(0);
    setTypedCount(0);
    setScore(0);
    setStreak(0);
    setCharsTyped(0);
    setSecondsLeft(ROUND_SECONDS);
    setMascotState("neutral");
    setGameOver(false);
    setRunning(true);
  }

  function handleKeyPress(char: string, isCorrect: boolean) {
    if (!running) return;

    if (isCorrect) {
      setCharsTyped((c) => c + 1);
      const nextTypedCount = typedCount + 1;
      setTypedCount(nextTypedCount);

      if (nextTypedCount >= currentWord.length) {
        setScore((s) => s + currentWord.length * 10);
        setStreak((s) => s + 1);
        setSecondsLeft((s) => Math.min(ROUND_SECONDS + 60, s + CORRECT_WORD_BONUS_SECONDS));
        setMascotState("happy");
        starBurstRef.current?.burst();
        setWordIndex((i) => i + 1);
        setTypedCount(0);
      }
    } else {
      setStreak(0);
      setSecondsLeft((s) => Math.max(0, s - WRONG_CHAR_PENALTY_SECONDS));
      setMascotState("sad");
      shakeX.value = withSequence(
        withTiming(-8, { duration: 40 }),
        withTiming(8, { duration: 40 }),
        withTiming(-6, { duration: 40 }),
        withTiming(6, { duration: 40 }),
        withTiming(0, { duration: 40 }),
      );
      if (sadTimeout.current) clearTimeout(sadTimeout.current);
      sadTimeout.current = setTimeout(() => setMascotState("neutral"), 400);
    }
  }

  function handleBackspace() {
    if (!running) return;
    setTypedCount((c) => Math.max(0, c - 1));
  }

  const isLowTime = secondsLeft <= LOW_TIME_THRESHOLD;
  const nextChar = running ? currentWord[typedCount]?.toUpperCase() : undefined;

  return (
    <View className="flex-1 bg-cream">
      <View style={{ paddingTop: 56, paddingHorizontal: 20 }}>
        <View className="flex-row items-center gap-2">
          <Zap size={20} color="#d97706" fill="#d97706" />
          <Text className="text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
            Time Attack
          </Text>
        </View>

        {/* Rules badges */}
        <View className="mt-3 flex-row gap-2">
          <View className="flex-row items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5">
            <Text className="text-xs text-emerald-700" style={{ fontFamily: "Outfit_600SemiBold" }}>
              +3s / từ đúng
            </Text>
          </View>
          <View className="flex-row items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5">
            <Text className="text-xs text-rose-600" style={{ fontFamily: "Outfit_600SemiBold" }}>
              -1s / ký tự sai
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
      >
        {/* Countdown timer */}
        <View className="items-center">
          <Text
            style={{
              fontFamily: "JetBrainsMono_700Bold",
              fontSize: 64,
              color: isLowTime ? "#e11d48" : colors.ink,
            }}
          >
            {String(Math.max(0, secondsLeft)).padStart(2, "0")}
          </Text>
          <Text className="text-xs text-ink/40" style={{ fontFamily: "Outfit_500Medium" }}>
            giây còn lại
          </Text>
        </View>

        {/* Score / streak / chars row */}
        <View className="mt-5 flex-row gap-3">
          <StatChip icon={Hash} value={`${score}`} label="Điểm" />
          <StatChip icon={Flame} value={`${streak}`} label="Streak" />
          <StatChip icon={Zap} value={`${charsTyped}`} label="Ký tự" />
        </View>

        {!running && !gameOver && (
          <View className="mt-8 items-center">
            <Mascot state="neutral" size={96} />
            <Pressable
              onPress={startGame}
              className="mt-6 flex-row items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4"
            >
              <Play size={18} color="white" fill="white" />
              <Text className="text-base text-white" style={{ fontFamily: "Outfit_600SemiBold" }}>
                Bắt đầu
              </Text>
            </Pressable>
          </View>
        )}

        {gameOver && (
          <View className="mt-8 items-center">
            <Mascot state="happy" size={96} />
            <Text className="mt-4 text-xl text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
              Hết giờ!
            </Text>
            <Text className="mt-1 text-sm text-ink/50" style={{ fontFamily: "Outfit" }}>
              Bạn đạt {score} điểm, gõ {charsTyped} ký tự
            </Text>
            <Pressable
              onPress={startGame}
              className="mt-6 flex-row items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4"
            >
              <Play size={18} color="white" fill="white" />
              <Text className="text-base text-white" style={{ fontFamily: "Outfit_600SemiBold" }}>
                Chơi lại
              </Text>
            </Pressable>
          </View>
        )}

        {running && (
          <View className="mt-6 items-center">
            <View style={{ position: "relative" }}>
              <Mascot state={mascotState} size={80} />
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
                  paddingVertical: 20,
                  alignItems: "center",
                  shadowColor: colors.ink,
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                },
              ]}
            >
              <View className="flex-row flex-wrap justify-center gap-2 px-4">
                {currentWord.split("").map((letter, i) => {
                  const isDone = i < typedCount;
                  const isCurrent = i === typedCount;
                  return (
                    <View
                      key={i}
                      style={{
                        width: 26,
                        height: 32,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDone ? "#d1fae5" : "white",
                        borderWidth: 2,
                        borderColor: isDone ? colors.emerald500 : isCurrent ? colors.indigo600 : "#e5e0d3",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "JetBrainsMono_700Bold",
                          fontSize: 15,
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
        )}
      </ScrollView>

      <VirtualKeyboard
        nextChar={nextChar}
        onKeyPress={handleKeyPress}
        onBackspace={handleBackspace}
        disabled={!running}
      />
    </View>
  );
}

function StatChip({ icon: Icon, value, label }: { icon: typeof Hash; value: string; label: string }) {
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
