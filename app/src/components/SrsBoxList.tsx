import { Text, View } from "react-native";

import { colors } from "../theme";
import { SRS_BOX_META } from "../srs";

export interface SrsBoxListProps {
  /** Word count per box, indexed 1-5 (same shape as `StatsResponse.boxDistribution`). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * The 5 SRS memory boxes as a vertical list of rows (number badge + label +
 * subtitle + count), matching the mockup's dedicated SRS screen. Box 5
 * ("Mastered") gets an inverted dark row per the mockup's `.srs-box` dark
 * variant.
 */
export default function SrsBoxList({ distribution }: SrsBoxListProps) {
  return (
    <View style={{ gap: 10 }}>
      {SRS_BOX_META.map((meta) => {
        const isMastered = meta.box === 5;
        return (
          <View
            key={meta.box}
            className="flex-row items-center gap-3.5 rounded-2xl px-4 py-3.5"
            style={{
              backgroundColor: isMastered ? colors.ink : "#ffffff",
              borderWidth: 1,
              borderColor: isMastered ? colors.ink : colors.border,
            }}
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: meta.bg }}
            >
              <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 16, color: meta.fg }}>
                {isMastered ? "💎" : meta.box}
              </Text>
            </View>
            <View className="flex-1">
              <Text
                style={{
                  fontFamily: "Outfit_700Bold",
                  fontSize: 13,
                  color: isMastered ? "#ffffff" : colors.ink,
                }}
              >
                {meta.label}
              </Text>
              <Text
                className="text-[11px]"
                style={{
                  fontFamily: "PlusJakartaSans",
                  color: isMastered ? colors.inkFaint : colors.inkMuted,
                }}
              >
                {meta.sublabel}
              </Text>
            </View>
            <View className="items-end">
              <Text
                style={{
                  fontFamily: "JetBrainsMono_700Bold",
                  fontSize: 18,
                  color: isMastered ? "#ffffff" : colors.ink,
                }}
              >
                {distribution[meta.box]}
              </Text>
              <Text
                className="text-[10px]"
                style={{ fontFamily: "PlusJakartaSans", color: isMastered ? colors.inkFaint : colors.inkMuted }}
              >
                từ
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
