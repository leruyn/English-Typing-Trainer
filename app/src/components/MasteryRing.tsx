import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { colors } from "../theme";

export interface MasteryRingProps {
  /** 0-100 mastery percentage. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Optional small label rendered under the percentage (e.g. "mastery"). */
  label?: string;
}

/**
 * A circular SVG progress ring showing overall word mastery. Reused by the
 * Home dashboard and the Stats screen.
 */
export default function MasteryRing({
  percent,
  size = 120,
  strokeWidth = 12,
  color = colors.emerald500,
  trackColor = "#e5e0d3",
  label,
}: MasteryRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <Text style={{ fontFamily: "Outfit_700Bold", fontSize: size * 0.22, color: colors.ink }}>
        {Math.round(clamped)}%
      </Text>
      {label ? (
        <Text style={{ fontFamily: "Outfit_500Medium", fontSize: size * 0.09, color: colors.ink, opacity: 0.5 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
