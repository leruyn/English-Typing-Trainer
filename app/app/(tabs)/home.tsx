import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookOpenCheck, Keyboard, ListChecks, Zap } from "lucide-react-native";

import { colors } from "../../src/theme";
import { getGreeting, getLevelProgress, displayNameFromEmail } from "../../src/time";
import MasteryRing from "../../src/components/MasteryRing";
import { useAuth } from "../../src/context/AuthContext";
import { useProgressQuery, useStatsQuery } from "../../src/api/hooks";

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
    // `retake: "1"` tells the assessment flow this is a voluntary re-take
    // from an already-onboarded account, not first-time onboarding - see
    // `(onboarding)/assessment.tsx` / `complete.tsx`, which branch on it to
    // return here afterward instead of continuing into the pace/account
    // onboarding steps.
    href: { pathname: "/(onboarding)/assessment" as const, params: { retake: "1" } },
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: stats } = useStatsQuery();
  const { data: progressData } = useProgressQuery();

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
