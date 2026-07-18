import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Baby, BookOpen, Briefcase, GraduationCap, Rocket } from "lucide-react-native";

import { colors } from "../../src/theme";
import Mascot from "../../src/components/Mascot";
import { useAuth } from "../../src/context/AuthContext";
import { skipAssessment } from "../../src/api/endpoints";
import type { LearnerGroup } from "@art/shared";

/**
 * Onboarding step between account creation and the entrance assessment:
 * who is this account for?
 *
 * Placement can't start from a test alone - a 5-6 year old can't
 * meaningfully take a reading-based quiz (they're placed straight on the
 * beginner track, no test), and an adult self-describing as "khá/giỏi"
 * shouldn't have to slog up from the same mid-scale starting difficulty as
 * everyone else. The choice here either skips the test entirely (child) or
 * seeds its starting difficulty (everyone else); the test then refines
 * from that seed, and later continuous calibration (see
 * `GET /progress/calibration`) refines further from real practice data.
 */

interface ProfileOption {
  key: string;
  group: LearnerGroup;
  /** null = skip the assessment entirely (young children). */
  startDifficulty: number | null;
  icon: typeof Baby;
  title: string;
  subtitle: string;
  tint: string;
  tintBg: string;
}

const OPTIONS: ProfileOption[] = [
  {
    key: "child",
    group: "child",
    startDifficulty: null,
    icon: Baby,
    title: "Bé mới làm quen (5-8 tuổi)",
    subtitle: "Bỏ qua bài test, bắt đầu từ những từ dễ nhất",
    tint: colors.rose600,
    tintBg: colors.rose100,
  },
  {
    key: "student",
    group: "student",
    startDifficulty: 2,
    icon: GraduationCap,
    title: "Học sinh",
    subtitle: "Đang học tiếng Anh ở trường",
    tint: colors.amber600,
    tintBg: colors.amber100,
  },
  {
    key: "adult-new",
    group: "adult",
    startDifficulty: 2,
    icon: BookOpen,
    title: "Người lớn — mới bắt đầu",
    subtitle: "Học lại từ đầu hoặc đã lâu không dùng",
    tint: colors.emerald600,
    tintBg: colors.emerald100,
  },
  {
    key: "adult-mid",
    group: "adult",
    startDifficulty: 3,
    icon: Briefcase,
    title: "Người lớn — có nền tảng",
    subtitle: "Đọc hiểu cơ bản, muốn củng cố từ vựng",
    tint: colors.indigo600,
    tintBg: colors.indigo100,
  },
  {
    key: "adult-strong",
    group: "adult",
    startDifficulty: 4,
    icon: Rocket,
    title: "Người lớn — khá / giỏi",
    subtitle: "Dùng tiếng Anh thường xuyên, muốn nâng cao",
    tint: colors.ink,
    tintBg: colors.cream2,
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(option: ProfileOption) {
    if (submittingKey) return;
    setError(null);

    if (option.startDifficulty === null) {
      // Child path: no test. Mark the account assessed server-side and go
      // straight to the home tabs on the beginner track.
      setSubmittingKey(option.key);
      try {
        const result = await skipAssessment(option.group);
        await updateUser({
          hasCompletedAssessment: true,
          currentTrack: result.currentTrack,
          learnerGroup: option.group,
        });
        router.replace("/(tabs)/home");
      } catch {
        setError("Không lưu được lựa chọn. Kiểm tra mạng rồi thử lại nhé.");
      } finally {
        setSubmittingKey(null);
      }
      return;
    }

    router.push({
      pathname: "/(onboarding)/assessment",
      params: { group: option.group, start: String(option.startDifficulty) },
    });
  }

  return (
    <View className="flex-1 bg-cream px-6 pt-16 pb-10">
      <View className="items-center">
        <Mascot state="happy" size={80} />
        <Text
          className="mt-4 text-center text-2xl text-ink"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          Ai sẽ học cùng chúng mình?
        </Text>
        <Text
          className="mt-2 max-w-xs text-center text-sm text-ink/60"
          style={{ fontFamily: "Outfit" }}
        >
          Chọn đúng nhóm để bài khảo sát bắt đầu ở độ khó phù hợp với bạn.
        </Text>
      </View>

      <View className="mt-6 gap-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSubmitting = submittingKey === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => handleSelect(option)}
              disabled={submittingKey !== null}
              className="flex-row items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                opacity: submittingKey !== null && !isSubmitting ? 0.5 : 1,
              }}
            >
              <View
                className="h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: option.tintBg }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={option.tint} />
                ) : (
                  <Icon size={20} color={option.tint} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-base text-ink" style={{ fontFamily: "Outfit_600SemiBold" }}>
                  {option.title}
                </Text>
                <Text className="mt-0.5 text-xs text-ink/50" style={{ fontFamily: "PlusJakartaSans" }}>
                  {option.subtitle}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <Text
          className="mt-4 text-center text-xs text-rose-600"
          style={{ fontFamily: "Outfit_500Medium" }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
