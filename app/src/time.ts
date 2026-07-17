/**
 * Small home-screen display helpers - purely presentational (no backend
 * dependency), so they live client-side rather than in `@art/shared`.
 */

/** Time-of-day greeting in Vietnamese, matching the mockup's "Chào buổi sáng/chiều/tối". */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Chào buổi sáng";
  if (hour >= 12 && hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Derives a display name from an email's local-part since the `User` model has no name field. */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return email;
  return cleaned
    .split(" ")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export interface LevelProgress {
  level: number;
  /** XP earned within the current level. */
  xpIntoLevel: number;
  /** XP still needed to reach the next level. */
  xpToNextLevel: number;
  /** 0-100 progress through the current level. */
  percent: number;
}

/**
 * Client-side-only leveling curve for display purposes: level `n` requires
 * `100 * n` cumulative XP more than level `n-1` (a simple increasing/
 * quadratic curve - level 1->2 costs 100 XP, level 2->3 costs 200 more,
 * etc.), so `totalXp` (from `GET /stats`) maps to a level + progress bar
 * without any backend changes. Purely cosmetic - doesn't affect SRS/XP
 * calculation itself.
 */
export function getLevelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, totalXp);
  let level = 1;
  let cumulativeForCurrentLevel = 0;
  // cumulativeForLevel(n) = 100 * n * (n+1) / 2
  for (;;) {
    const costOfThisLevel = 100 * level;
    if (cumulativeForCurrentLevel + costOfThisLevel > xp) break;
    cumulativeForCurrentLevel += costOfThisLevel;
    level += 1;
  }
  const costOfCurrentLevel = 100 * level;
  const xpIntoLevel = xp - cumulativeForCurrentLevel;
  const xpToNextLevel = costOfCurrentLevel - xpIntoLevel;
  const percent = Math.round((xpIntoLevel / costOfCurrentLevel) * 100);
  return { level, xpIntoLevel, xpToNextLevel, percent };
}
