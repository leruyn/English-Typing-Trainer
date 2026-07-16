import { useEffect } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type MascotState = "neutral" | "happy" | "sad";

export interface MascotProps {
  state?: MascotState;
  size?: number;
}

/** Mouth path per state, drawn relative to a 100x100 viewBox. */
const MOUTHS: Record<MascotState, string> = {
  neutral: "M 38 62 Q 50 62 62 62",
  happy: "M 34 58 Q 50 76 66 58",
  sad: "M 34 68 Q 50 54 66 68",
};

/**
 * A small, friendly SVG face shown near the practice word card. Reacts to
 * the current practice outcome via the `state` prop — swaps mouth shape and
 * fades in rosy cheeks when happy.
 */
export default function Mascot({ state = "neutral", size = 96 }: MascotProps) {
  const blush = useSharedValue(0);

  useEffect(() => {
    blush.value = withTiming(state === "happy" ? 1 : 0, { duration: 250 });
  }, [state, blush]);

  const blushProps = useAnimatedProps(() => ({
    opacity: blush.value,
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Body */}
      <Circle cx={50} cy={50} r={46} fill="#fef3c7" stroke="#fbbf24" strokeWidth={2} />

      {/* Blush (fades in on happy) */}
      <AnimatedCircle cx={26} cy={58} r={7} fill="#fb7185" animatedProps={blushProps} />
      <AnimatedCircle cx={74} cy={58} r={7} fill="#fb7185" animatedProps={blushProps} />

      {/* Eyes */}
      {state === "sad" ? (
        <>
          <Path d="M 30 40 Q 34 36 38 40" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M 62 40 Q 66 36 70 40" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <Circle cx={34} cy={40} r={4.5} fill="#0f172a" />
          <Circle cx={66} cy={40} r={4.5} fill="#0f172a" />
        </>
      )}

      {/* Mouth */}
      <Path
        d={MOUTHS[state]}
        stroke="#0f172a"
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
