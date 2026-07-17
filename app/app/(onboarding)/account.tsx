import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock, Mail, UserPlus } from "lucide-react-native";

import { colors } from "../../src/theme";
import Mascot from "../../src/components/Mascot";
import { useAuth } from "../../src/context/AuthContext";
import { ApiError } from "../../src/api/client";

/**
 * Onboarding step: create an account (or sign into an existing one) so the
 * rest of the app - words, SRS progress, stats - has a user to attach to on
 * the backend. Reached from `pace.tsx` (carrying `minutesPerDay`) or
 * directly from `welcome.tsx`'s "already have an account" link.
 *
 * This now runs *before* the entrance assessment (previously the assessment
 * ran first, pre-account, and answers were stashed in route params to be
 * submitted alongside registration) - account state is what decides whether
 * the assessment runs at all: a brand new registration is always
 * unassessed, but a login might be logging back into an account that
 * already completed it, in which case there's nothing left to do but go
 * straight to the home tabs.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { register, login } = useAuth();
  const params = useLocalSearchParams<{ minutesPerDay?: string }>();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (isSubmitting) return;
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Nhập email và mật khẩu để tiếp tục.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user =
        mode === "register"
          ? await register({
              email: trimmedEmail,
              password,
              minutesPerDay: params.minutesPerDay ? Number(params.minutesPerDay) : undefined,
            })
          : await login({ email: trimmedEmail, password });

      // New registrations are always unassessed; a login might belong to an
      // account that already finished the assessment before, in which case
      // there's nothing left to gate on.
      if (user.hasCompletedAssessment) {
        router.replace("/(tabs)/home");
      } else {
        router.replace("/(onboarding)/assessment");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.isNetworkError ? "Không có kết nối mạng. Thử lại nhé." : err.message);
      } else {
        setError("Đã có lỗi xảy ra. Thử lại nhé.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-cream px-6 pt-20 pb-10">
      <View className="items-center">
        <Mascot state="neutral" size={96} />
        <Text
          className="mt-5 text-center text-2xl text-ink"
          style={{ fontFamily: "Outfit_700Bold" }}
        >
          {mode === "register" ? "Tạo tài khoản học tập" : "Đăng nhập"}
        </Text>
        <Text
          className="mt-2 max-w-xs text-center text-sm text-ink/60"
          style={{ fontFamily: "Outfit" }}
        >
          {mode === "register"
            ? "Tiến trình SRS, streak và XP của bạn sẽ được đồng bộ và lưu an toàn."
            : "Đăng nhập để tiếp tục tiến trình học tập của bạn."}
        </Text>
        {mode === "register" && (
          <Text
            className="mt-3 text-center text-xs text-ink/40"
            style={{ fontFamily: "Outfit_500Medium" }}
          >
            Sau khi tạo tài khoản, bạn sẽ làm một bài khảo sát ngắn để đo trình độ.
          </Text>
        )}
      </View>

      <View className="mt-8 gap-3">
        <View
          className="flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3.5"
          style={{ borderWidth: 1, borderColor: "#eee7da" }}
        >
          <Mail size={16} color={colors.ink} opacity={0.4} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={{ flex: 1, fontFamily: "Outfit", fontSize: 14, color: colors.ink }}
          />
        </View>

        <View
          className="flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3.5"
          style={{ borderWidth: 1, borderColor: "#eee7da" }}
        >
          <Lock size={16} color={colors.ink} opacity={0.4} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Mật khẩu (tối thiểu 8 ký tự)"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={{ flex: 1, fontFamily: "Outfit", fontSize: 14, color: colors.ink }}
          />
        </View>

        {error && (
          <Text className="text-center text-xs text-rose-600" style={{ fontFamily: "Outfit_500Medium" }}>
            {error}
          </Text>
        )}
      </View>

      <View className="flex-1" />

      <Pressable
        onPress={handleSubmit}
        disabled={isSubmitting}
        className="flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4"
        style={{
          opacity: isSubmitting ? 0.6 : 1,
          shadowColor: colors.emerald500,
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <UserPlus size={18} color="white" />
        <Text className="text-base text-white" style={{ fontFamily: "Outfit_600SemiBold" }}>
          {isSubmitting
            ? "Đang xử lý..."
            : mode === "register"
              ? "Tạo tài khoản & bắt đầu"
              : "Đăng nhập"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setError(null);
          setMode((m) => (m === "register" ? "login" : "register"));
        }}
        className="items-center py-3"
      >
        <Text
          className="text-sm text-ink/60"
          style={{ fontFamily: "Outfit_500Medium", textDecorationLine: "underline" }}
        >
          {mode === "register" ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Tạo mới"}
        </Text>
      </Pressable>
    </View>
  );
}
