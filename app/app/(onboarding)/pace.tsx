import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Clock, Sparkles } from "lucide-react-native";

import { colors } from "../../src/theme";
import { computeDailyNewWordCap } from "@art/shared";

const OPTIONS = [5, 10, 15, 20] as const;

export default function PaceScreen() {
  const router = useRouter();
  const { track, answers } = useLocalSearchParams<{ track?: string; answers?: string }>();
  const [minutes, setMinutes] = useState<number>(10);

  const newWordCap = useMemo(() => computeDailyNewWordCap(minutes), [minutes]);

  return (
    <View className="flex-1 bg-cream px-6 pt-20 pb-10">
      <View className="items-center">
        <View
          className="h-14 w-14 items-center justify-center rounded-full bg-indigo-600"
          style={{
            shadowColor: colors.indigo600,
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Clock size={24} color="white" />
        </View>
        <Text
          className="mt-5 text-center text-2xl text-ink"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          Mỗi ngày bạn có bao nhiêu phút?
        </Text>
        <Text
          className="mt-2 max-w-xs text-center text-sm text-ink/60"
          style={{ fontFamily: "Outfit" }}
        >
          Chúng tôi sẽ đề xuất số từ mới mỗi ngày phù hợp với thời gian của bạn.
        </Text>
      </View>

      <View className="mt-10 flex-row flex-wrap justify-center gap-3">
        {OPTIONS.map((value, idx) => {
          const isLast = idx === OPTIONS.length - 1;
          const label = isLast ? "20+ phút" : `${value} phút`;
          const isSelected = minutes === value;
          return (
            <Pressable
              key={value}
              onPress={() => setMinutes(value)}
              className={`w-[45%] items-center rounded-2xl py-6 ${
                isSelected ? "bg-emerald-500" : "bg-white"
              }`}
              style={{
                borderWidth: 1.5,
                borderColor: isSelected ? colors.emerald500 : "#eee7da",
              }}
            >
              <Text
                className={isSelected ? "text-white" : "text-ink"}
                style={{ fontFamily: "Outfit_600SemiBold", fontSize: 18 }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-10 flex-1 items-center justify-center">
        <View
          className="items-center rounded-3xl bg-white px-8 py-6"
          style={{
            shadowColor: colors.ink,
            shadowOpacity: 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color={colors.emerald500} />
            <Text
              className="text-xs text-ink/50"
              style={{ fontFamily: "Outfit_500Medium" }}
            >
              Từ mới mỗi ngày
            </Text>
          </View>
          <Text
            className="mt-1 text-emerald-500"
            style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 44 }}
          >
            {newWordCap}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(onboarding)/account",
            params: { minutesPerDay: String(minutes), track: track ?? "", answers: answers ?? "" },
          })
        }
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
          Bắt đầu học
        </Text>
      </Pressable>
    </View>
  );
}
