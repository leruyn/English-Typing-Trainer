import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { BookOpen, Clock, Ear, Eye, Target, Volume2, Zap } from "lucide-react-native";

import type { PracticeMode } from "@art/shared";
import { colors } from "../../src/theme";
import Mascot, { type MascotState } from "../../src/components/Mascot";
import StarBurst, { type StarBurstHandle } from "../../src/components/StarBurst";
import VirtualKeyboard from "../../src/components/VirtualKeyboard";

import beginnerVocabJson from "../../../packages/shared/data/vocab/beginner.json";

interface VocabTopic {
  topicId: string;
  topicNameVi: string;
  cefrLevel: string;
  words: Array<{
    word: string;
    pos: string;
    meaningVi: string;
    exampleSentence: string;
    iconHint: string;
  }>;
}

const beginnerVocab = beginnerVocabJson as VocabTopic[];

interface PracticeWord {
  word: string;
  pos: string;
  meaningVi: string;
  exampleSentence: string;
  iconHint: string;
  topicNameVi: string;
}

const WORDS: PracticeWord[] = beginnerVocab.flatMap((topic) =>
  topic.words.map((w) => ({ ...w, topicNameVi: topic.topicNameVi })),
);

const MODES: Array<{ key: PracticeMode; label: string; icon: typeof Eye }> = [
  { key: "visual", label: "Visual", icon: Eye },
  { key: "dictation", label: "Dictation", icon: Ear },
  { key: "context", label: "Context", icon: BookOpen },
];

export default function PracticeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: PracticeMode =
    params.mode === "dictation" || params.mode === "context" ? params.mode : "visual";

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

  const starBurstRef = useRef<StarBurstHandle>(null);
  const shakeX = useSharedValue(0);
  const sadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentWord = WORDS[wordIndex % WORDS.length];

  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setHasSpoken(false);
  }, [wordIndex]);

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
    setWordIndex((i) => (i + 1) % WORDS.length);
    setTypedCount(0);
    setWordComplete(false);
    setMascotState("neutral");
  }

  function handleKeyPress(char: string, isCorrect: boolean) {
    if (wordComplete) return;

    if (isCorrect) {
      setCorrectPresses((c) => c + 1);
      setTotalCharsTyped((c) => c + 1);
      const nextTypedCount = typedCount + 1;
      setTypedCount(nextTypedCount);

      if (nextTypedCount >= currentWord.word.length) {
        setWordComplete(true);
        setMascotState("happy");
        starBurstRef.current?.burst();
        setTimeout(goToNextWord, 900);
      }
    } else {
      setWrongPresses((c) => c + 1);
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

  function speakWord() {
    setHasSpoken(true);
    Speech.speak(currentWord.word, { language: "en-US" });
  }

  const nextChar = wordComplete ? undefined : currentWord.word[typedCount]?.toUpperCase();

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
                  {currentWord.pos}
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
              {currentWord.word.split("").map((letter, i) => {
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
