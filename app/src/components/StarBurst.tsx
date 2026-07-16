import { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Star } from "lucide-react-native";

export interface StarBurstHandle {
  /** Imperatively (re)plays the burst animation from the beginning. */
  burst: () => void;
}

const STAR_COLORS = ["#fbbf24", "#d97706", "#10b981", "#fbbf24", "#4f46e5"];

/** Per-star target offsets (x, y in px) and rotation, spread in a fan. */
const STAR_TARGETS = [
  { x: -46, y: -50, rotate: -25 },
  { x: -22, y: -70, rotate: -10 },
  { x: 0, y: -78, rotate: 0 },
  { x: 22, y: -70, rotate: 10 },
  { x: 46, y: -50, rotate: 25 },
];

const BURST_DURATION_MS = 620;

function Particle({
  progress,
  target,
  color,
}: {
  progress: SharedValue<number>;
  target: { x: number; y: number; rotate: number };
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    // progress: 0 -> 1 over the lifetime of a single burst.
    // Fade in quickly, hold, then fade out near the end.
    const opacity = interpolate(
      progress.value,
      [0, 0.12, 0.75, 1],
      [0, 1, 1, 0],
    );
    // Ease-out rise: fast at first, settling toward the target offset.
    const eased = interpolate(progress.value, [0, 1], [0, 1]);
    const scale = interpolate(progress.value, [0, 0.2, 1], [0.3, 1.1, 0.9]);

    return {
      opacity,
      transform: [
        { translateX: target.x * eased },
        { translateY: target.y * eased },
        { scale },
        { rotate: `${target.rotate * eased}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[{ position: "absolute" }, style]}>
      <Star size={22} color={color} fill={color} />
    </Animated.View>
  );
}

/**
 * A small celebratory star-pop effect, meant to be shown when a word is
 * completed correctly. Renders 5 stars fanned out from a center point that
 * pop up and fade out. Trigger it imperatively via the exposed ref:
 *
 *   const burstRef = useRef<StarBurstHandle>(null);
 *   burstRef.current?.burst();
 *   <StarBurst ref={burstRef} />
 *
 * (A `key`-remount trick on the parent's usage site is an alternative way
 * to retrigger if imperative refs don't fit a given call site.)
 */
const StarBurst = forwardRef<StarBurstHandle>(function StarBurst(_props, ref) {
  const progresses = [
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
  ];

  useImperativeHandle(
    ref,
    () => ({
      burst: () => {
        progresses.forEach((p, i) => {
          p.value = 0;
          p.value = withDelay(i * 25, withTiming(1, { duration: BURST_DURATION_MS }));
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
      }}
    >
      {STAR_TARGETS.map((target, i) => (
        <Particle key={i} progress={progresses[i]} target={target} color={STAR_COLORS[i]} />
      ))}
    </View>
  );
});

export default StarBurst;
