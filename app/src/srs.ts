import { colors } from "./theme";

/**
 * Shared display metadata for the 5 SRS memory boxes (see the project's
 * pedagogy spec: Hộp 1 Ngắn hạn -> Hộp 5 Mastered 💎). Used by the Practice
 * screen's SRS chip, the Vault's per-word badge, and the Stats screen's box
 * list, so the labels/colors stay consistent everywhere a box number is
 * shown.
 */
export interface SrsBoxMeta {
  box: 1 | 2 | 3 | 4 | 5;
  label: string;
  sublabel: string;
  bg: string;
  fg: string;
}

export const SRS_BOX_META: SrsBoxMeta[] = [
  { box: 1, label: "Ngắn hạn", sublabel: "Mới học · gõ lỗi nhiều", bg: colors.rose100, fg: colors.rose600 },
  { box: 2, label: "Tạm thời", sublabel: "Gõ trơn tru một chút", bg: colors.amber100, fg: colors.amber600 },
  { box: 3, label: "Trung hạn", sublabel: "Gõ nhịp nhàng, đúng hạn", bg: colors.indigo100, fg: colors.indigo },
  { box: 4, label: "Bền vững", sublabel: "Gõ rất nhanh, gần Mastery", bg: colors.emerald100, fg: colors.emerald600 },
  { box: 5, label: "Mastered 💎", sublabel: "Phản xạ tự động", bg: colors.ink, fg: "#ffffff" },
];

export function getSrsBoxMeta(box: number): SrsBoxMeta {
  return SRS_BOX_META[Math.max(1, Math.min(5, box)) - 1];
}
