import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookOpenCheck, Keyboard, ListChecks, TrendingDown, TrendingUp, X, Zap } from "lucide-react-native";

import type { CefrTrack } from "@art/shared";
import { colors } from "../../src/theme";
import { getGreeting, getLevelProgress, displayNameFromEmail } from "../../src/time";
import MasteryRing from "../../src/components/MasteryRing";
import { useAuth } from "../../src/context/AuthContext";
import { useCalibrationQuery, useProgressQuery, useStatsQuery, useUpdateTrack } from "../../src/api/hooks";

const TRACK_LABEL: Record<CefrTrack, string> = {
  beginner: "Beginner (A1-A2)",
  intermediate: "Intermediate (B1-B2)",
  advanced: "Advanced (C1-C2)",
};

/**
 * The four quick-action tiles from the mockup's home bento grid. Each tint
 * matches the mockup's icon-badge color (`bg-emerald`/`bg-amber`/
 * `bg-indigo`/`bg-rose`) exactly.
 */
const QUICK_ACTIONS = [
  {
    key: "practice",
    label: "Đấu trường gõ",
    description: "3 chế độ luyện phản xạ",
    icon: Keyboard,
    tint: colors.emerald600,
    tintBg: colors.emerald100,
    href: "/(tabs)/practice" as const,
  },
  {
    key: "timeattack",
    label: "Chớp nhoáng",
    description: "45s thử thách tốc độ",
    icon: Zap,
    tint: colors.amber600,
    tintBg: colors.amber100,
    href: "/(tabs)/time-attack" as const,
  },
  {
    key: "vault",
    label: "Kho từ vựng",
    description: "Tra cứu · nghe phát âm",
    icon: BookOpenCheck,
    tint: colors.indigo600,
    tintBg: colors.indigo100,
    href: "/(tabs)/vault" as const,
  },
  {
    key: "assessment",
    label: "Khảo sát",
    description: "Đo trình độ CEFR",
    icon: ListChecks,
    tint: colors.rose600,
    tintBg: colors.rose100,
    // The assessment screen always runs authenticated now (account creation
    // happens before it - see (onboarding)/account.tsx), so a voluntary
    // retake from an already-onboarded account needs no special param: it
    // submits the result and returns to /(tabs)/home the same way a
    // first-time post-registration assessment does.
    href: "/(onboarding)/assessment" as const,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { data: stats } = useStatsQuery();
  const { data: progressData } = useProgressQuery();
  const { data: calibration } = useCalibrationQuery();
  const updateTrackMutation = useUpdateTrack();
  // Session-local dismiss: declining a suggestion shouldn't nag again until
  // the app restarts (and the 6h query staleTime keeps even that gentle).
  const [calibrationDismissed, setCalibrationDismissed] = useState(false);

  const calibrationSuggestion =
    !calibrationDismissed && calibration?.suggestion && calibration.suggestedTrack
      ? calibration
      : null;

  async function acceptCalibration() {
    const target = calibrationSuggestion?.suggestedTrack;
    if (!target || updateTrackMutation.isPending) return;
    try {
      await updateTrackMutation.mutateAsync(target);
      await updateUser({ currentTrack: target });
      setCalibrationDismissed(true);
    } catch {
      // Leave the banner up - the user can retry; no error state needed
      // beyond the button simply not having taken effect.
    }
  }

  const masteryPercent = stats?.masteryPercent ?? 0;
  const streakDays = stats?.currentStreak ?? 0;
  const totalXp = stats?.totalXp ?? 0;
  const levelProgress = getLevelProgress(totalXp);
  const dueTodayCount = (progressData?.progress ?? []).filter((p) => p.isDue).length;
  const totalWordsTracked = progressData?.progress.length ?? 0;
  const masteredCount = (progressData?.progress ?? []).filter((p) => p.srsBox === 5).length;

  const displayName = user?.email ? displayNameFromEmail(user.email) : "";

  return (
    <View className="flex-1 bg-cream" style={{ paddingTop: insets.top }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
      >
        {/* ===== Greeting card ===== */}
        <View
          className="mt-4 overflow-hidden rounded-3xl px-5 py-5"
          style={{ backgroundColor: colors.ink }}
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[13px] text-white/70" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
                {getGreeting()}
              </Text>
              <Text className="mt-0.5 text-xl text-white" style={{ fontFamily: "Outfit_700Bold" }}>
                {displayName ? `${displayName} 👋` : "Chào mừng 👋"}
              </Text>
            </View>
            <View
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: "rgba(245,158,11,0.18)" }}
            >
              <Text style={{ fontSize: 13 }}>🔥</Text>
              <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 13, color: "#fbbf24" }}>
                {streakDays} ngày
              </Text>
            </View>
          </View>

          {/* Level / XP progress */}
          <View
            className="mt-4 overflow-hidden rounded-full"
            style={{ height: 8, backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.max(4, Math.min(100, levelProgress.percent))}%`,
                backgroundColor: colors.emerald500,
                borderRadius: 999,
              }}
            />
          </View>
          <View className="mt-1.5 flex-row justify-between">
            <Text className="text-[11px] text-white/70" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
              Cấp độ {levelProgress.level} · {totalXp.toLocaleString("vi-VN")} XP
            </Text>
            <Text className="text-[11px] text-white/70" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
              {levelProgress.xpToNextLevel} XP tới cấp {levelProgress.level + 1}
            </Text>
          </View>
        </View>

        {/* ===== Placement calibration banner ===== */}
        {calibrationSuggestion && calibrationSuggestion.suggestedTrack && (
          <View
            className="mt-4 rounded-2xl bg-white px-4 py-4"
            style={{ borderWidth: 1.5, borderColor: colors.indigo }}
          >
            <View className="flex-row items-start gap-3">
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: colors.indigo100 }}
              >
                {calibrationSuggestion.suggestion === "promote" ? (
                  <TrendingUp size={18} color={colors.indigo600} />
                ) : (
                  <TrendingDown size={18} color={colors.indigo600} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-sm text-ink" style={{ fontFamily: "Outfit_600SemiBold" }}>
                  {calibrationSuggestion.suggestion === "promote"
                    ? "Bạn đang gõ quá tốt so với cấp hiện tại!"
                    : "Cấp hiện tại có vẻ hơi khó với bạn"}
                </Text>
                <Text className="mt-1 text-xs text-ink/60" style={{ fontFamily: "PlusJakartaSans" }}>
                  Dựa trên kết quả gõ gần đây, gợi ý chuyển sang{" "}
                  {TRACK_LABEL[calibrationSuggestion.suggestedTrack]}.
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={acceptCalibration}
                    disabled={updateTrackMutation.isPending}
                    className="flex-row items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2"
                    style={{ opacity: updateTrackMutation.isPending ? 0.6 : 1 }}
                  >
                    {updateTrackMutation.isPending && (
                      <ActivityIndicator size="small" color="white" />
                    )}
                    <Text className="text-xs text-white" style={{ fontFamily: "Outfit_600SemiBold" }}>
                      Chuyển cấp
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setCalibrationDismissed(true)}
                    className="rounded-full px-4 py-2"
                    style={{ borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text className="text-xs text-ink/60" style={{ fontFamily: "Outfit_500Medium" }}>
                      Để sau
                    </Text>
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={() => setCalibrationDismissed(true)} hitSlop={8}>
                <X size={16} color={colors.inkFaint} />
              </Pressable>
            </View>
          </View>
        )}

        {/* ===== Quick actions bento (2x2) ===== */}
        <Text
          className="ml-0.5 mt-6 text-xs text-ink/60"
          style={{ fontFamily: "PlusJakartaSans_700Bold", textTransform: "uppercase", letterSpacing: 0.6 }}
        >
          Luyện tập nhanh
        </Text>
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 12 }}>
          {QUICK_ACTIONS.map(({ key, label, description, icon: Icon, tint, tintBg, href }) => (
            <Pressable
              key={key}
              onPress={() => router.push(href as never)}
              className="rounded-2xl bg-white px-4 py-4"
              style={{
                width: "47%",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                className="h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: tintBg }}
              >
                <Icon size={18} color={tint} />
              </View>
              <Text className="mt-2.5 text-sm text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
                {label}
              </Text>
              <Text className="mt-0.5 text-[11px] text-ink/50" style={{ fontFamily: "PlusJakartaSans" }}>
                {description}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ===== Overview bento ===== */}
        <Text
          className="ml-0.5 mt-6 text-xs text-ink/60"
          style={{ fontFamily: "PlusJakartaSans_700Bold", textTransform: "uppercase", letterSpacing: 0.6 }}
        >
          Tổng quan
        </Text>
        <View className="mt-2 flex-row" style={{ gap: 12 }}>
          <View
            className="flex-1 flex-row items-center gap-3 rounded-2xl bg-white px-4 py-4"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <MasteryRing percent={masteryPercent} size={68} strokeWidth={8} />
            <View className="flex-1">
              <Text className="text-[13px] text-ink" style={{ fontFamily: "Outfit_700Bold" }}>
                Tỉ lệ làm chủ
              </Text>
              <Text className="mt-0.5 text-[11px] text-ink/50" style={{ fontFamily: "PlusJakartaSans" }}>
                {masteredCount} / {totalWordsTracked} từ
              </Text>
            </View>
          </View>

          <View
            className="flex-1 justify-center rounded-2xl bg-white px-4 py-4"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 26, color: colors.indigo }}>
              {dueTodayCount}
            </Text>
            <Text className="mt-0.5 text-[11px] text-ink/50" style={{ fontFamily: "PlusJakartaSans_500Medium" }}>
              Từ ôn tập hôm nay
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
