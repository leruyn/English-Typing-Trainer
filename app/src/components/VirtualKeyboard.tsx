import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Delete } from "lucide-react-native";

import { colors } from "../theme";

/**
 * Row tint accents — subtle pastel bottom borders so the keyboard reads as
 * playful/tactile without being loud. Top row leans indigo (tech), home row
 * leans emerald (primary/positive), bottom row leans amber (warm/energy).
 */
const ROW_TINTS = ["#c7d2fe", "#a7f3d0", "#fde68a"] as const;

const ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

interface PressState {
  key: string;
  correct: boolean;
  token: number;
}

interface KeyProps {
  label: string;
  isNext: boolean;
  pressState: PressState;
  tint: string;
  flexBasis?: number;
  onPress: (label: string) => void;
}

function KeyButton({ label, isNext, pressState, tint, onPress }: KeyProps) {
  const pulse = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (isNext) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 550 }),
          withTiming(0.35, { duration: 550 }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [isNext, pulse]);

  useEffect(() => {
    if (pressState.token === 0 || pressState.key !== label) return;
    if (pressState.correct) {
      scale.value = withSequence(
        withTiming(0.86, { duration: 60 }),
        withTiming(1.14, { duration: 90 }),
        withTiming(1, { duration: 110 }),
      );
      translateY.value = withSequence(
        withTiming(-7, { duration: 90 }),
        withTiming(0, { duration: 140 }),
      );
    } else {
      translateX.value = withSequence(
        withTiming(-7, { duration: 40 }),
        withTiming(7, { duration: 40 }),
        withTiming(-5, { duration: 40 }),
        withTiming(5, { duration: 40 }),
        withTiming(0, { duration: 40 }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressState.token]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    backgroundColor: interpolateColor(
      pulse.value,
      [0, 1],
      ["#ffffff", "#a7f3d0"],
    ),
    borderColor: interpolateColor(
      pulse.value,
      [0, 1],
      [tint, colors.emerald500],
    ),
    shadowOpacity: 0.08 + pulse.value * 0.35,
  }));

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          marginHorizontal: 3,
          borderRadius: 12,
          borderWidth: 1,
          borderBottomWidth: 3,
          shadowColor: colors.ink,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Key ${label}`}
        onPress={() => onPress(label)}
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
        }}
        hitSlop={4}
      >
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 15,
            color: colors.ink,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export interface VirtualKeyboardProps {
  /**
   * The next expected character (case-insensitive). The matching key pulses
   * to guide the user. Pass `undefined` when there's no active target (e.g.
   * between words) to clear all highlighting.
   */
  nextChar?: string;
  /**
   * Called on every letter key press with the pressed character (uppercase)
   * and whether it matched `nextChar`. The keyboard handles its own
   * animation/haptic feedback; the parent only needs to update its typing
   * state / score.
   */
  onKeyPress: (char: string, isCorrect: boolean) => void;
  /** Called when the backspace key is pressed. */
  onBackspace?: () => void;
  /** Disables all key presses (e.g. while a result banner is showing). */
  disabled?: boolean;
}

/**
 * A friendly on-screen QWERTY keyboard used across Practice and Time Attack.
 *
 * Docking contract: this component sizes itself to its natural content
 * height and must be placed as the last child of a flex column with
 * `flex-shrink: 0` (the default for a plain View) — never wrap it in
 * `position: absolute`. The parent screen's scrollable content area should
 * use `flex: 1, minHeight: 0` so it shrinks around this keyboard instead of
 * the keyboard floating over content.
 */
export default function VirtualKeyboard({
  nextChar,
  onKeyPress,
  onBackspace,
  disabled,
}: VirtualKeyboardProps) {
  const [pressState, setPressState] = useState<PressState>({
    key: "",
    correct: false,
    token: 0,
  });
  const tokenRef = useRef(0);
  const hiddenInputRef = useRef<TextInput>(null);

  const handlePress = useCallback(
    (label: string) => {
      if (disabled) return;
      const isCorrect = !!nextChar && label.toUpperCase() === nextChar.toUpperCase();
      tokenRef.current += 1;
      setPressState({ key: label, correct: isCorrect, token: tokenRef.current });
      Haptics.notificationAsync(
        isCorrect
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      ).catch(() => {
        // Haptics can be unavailable on some devices/simulators — ignore.
      });
      onKeyPress(label, isCorrect);
    },
    [disabled, nextChar, onKeyPress],
  );

  const handleBackspace = useCallback(() => {
    if (disabled) return;
    onBackspace?.();
  }, [disabled, onBackspace]);

  // TODO(physical-keyboard): this hidden TextInput attempts to capture
  // hardware keyboard input (useful on tablets with a Bluetooth keyboard)
  // via the `onKeyPress` native event, while `showSoftInputOnFocus={false}`
  // suppresses the on-screen OS keyboard so our custom VirtualKeyboard stays
  // the only visible keyboard. Hardware key event support via this trick is
  // inconsistent across Android OEMs/iOS Bluetooth keyboards and hasn't been
  // verified on a physical device/simulator in this environment — treat as
  // best-effort. If it proves unreliable, consider RNKeyEvent or a
  // dedicated native module instead.
  return (
    <View
      style={{
        flexShrink: 0,
        backgroundColor: colors.cream,
        paddingTop: 10,
        paddingBottom: 6,
        paddingHorizontal: 6,
        borderTopWidth: 1,
        borderTopColor: "#eee7da",
      }}
    >
      <TextInput
        ref={hiddenInputRef}
        value=""
        showSoftInputOnFocus={false}
        caretHidden
        autoCorrect={false}
        autoCapitalize="none"
        style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
        onKeyPress={(e) => {
          const key = e.nativeEvent.key;
          if (key === "Backspace") {
            handleBackspace();
          } else if (/^[a-zA-Z]$/.test(key)) {
            handlePress(key.toUpperCase());
          }
        }}
      />
      {ROWS.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={{
            flexDirection: "row",
            marginBottom: 6,
            paddingHorizontal: rowIndex === 1 ? 14 : rowIndex === 2 ? 28 : 0,
          }}
        >
          {row.map((label) => (
            <KeyButton
              key={label}
              label={label}
              isNext={!!nextChar && nextChar.toUpperCase() === label}
              pressState={pressState}
              tint={ROW_TINTS[rowIndex]}
              onPress={handlePress}
            />
          ))}
          {rowIndex === 2 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Backspace"
              onPress={handleBackspace}
              style={{
                flex: 1.6,
                marginHorizontal: 3,
                borderRadius: 12,
                borderWidth: 1,
                borderBottomWidth: 3,
                borderColor: ROW_TINTS[2],
                backgroundColor: "#ffffff",
                alignItems: "center",
                justifyContent: "center",
              }}
              hitSlop={4}
            >
              <Delete size={18} color={colors.ink} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
