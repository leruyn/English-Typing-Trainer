/**
 * Tracks how many brand-new (never-before-seen) words have been
 * introduced today, so the practice session queue (see `practice.tsx`) can
 * enforce `computeDailyNewWordCap`/`throttleNewWordsForReviewLoad` from
 * `@art/shared` across app restarts within the same calendar day - not
 * just within a single open session.
 *
 * Keyed by local calendar date (`YYYY-MM-DD`) so the count naturally
 * resets at midnight without needing a background job.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "art_daily_new_words";

interface DailyRecord {
  date: string;
  wordIds: string[];
}

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function readRecord(): Promise<DailyRecord> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const today = todayKey();
  if (!raw) return { date: today, wordIds: [] };
  try {
    const parsed = JSON.parse(raw) as DailyRecord;
    if (parsed.date !== today) return { date: today, wordIds: [] };
    return parsed;
  } catch {
    return { date: today, wordIds: [] };
  }
}

/** Number of distinct new words already introduced today. */
export async function getNewWordsIntroducedToday(): Promise<string[]> {
  return (await readRecord()).wordIds;
}

/** Marks a word as "introduced" today (idempotent - re-adding is a no-op). */
export async function recordNewWordIntroduced(wordId: string): Promise<void> {
  const record = await readRecord();
  if (!record.wordIds.includes(wordId)) {
    record.wordIds.push(wordId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }
}
