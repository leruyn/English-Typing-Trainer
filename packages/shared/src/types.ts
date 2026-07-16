/**
 * Core domain types shared between the server and the app.
 *
 * These types describe the vocabulary domain (words, CEFR levels, topics),
 * the spaced-repetition (SRS) progress tracked per user/word, practice
 * attempts logged during typing drills, and the adaptive entrance
 * assessment used to place a new user into a starting track.
 */

/**
 * CEFR proficiency level for a single vocabulary word.
 *
 * The Common European Framework of Reference for Languages levels, from
 * beginner (A1) to mastery (C2).
 */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/**
 * Coarse-grained grouping of {@link CefrLevel}s used for onboarding,
 * curriculum selection, and the entrance assessment's suggested track.
 *
 * Mapping: 'beginner' -> A1-A2, 'intermediate' -> B1-B2, 'advanced' -> C1-C2.
 */
export type CefrTrack = 'beginner' | 'intermediate' | 'advanced';

/**
 * Maps each {@link CefrLevel} to the {@link CefrTrack} it belongs to.
 * Exported so callers don't have to re-derive this grouping themselves.
 */
export const CEFR_LEVEL_TO_TRACK: Record<CefrLevel, CefrTrack> = {
  A1: 'beginner',
  A2: 'beginner',
  B1: 'intermediate',
  B2: 'intermediate',
  C1: 'advanced',
  C2: 'advanced',
};

/**
 * The three practice modes a user can drill a word with.
 *
 * - `visual`: an emoji/icon plus the Vietnamese meaning is shown; the user
 *   types the English word.
 * - `dictation`: the word is spoken aloud via TTS; the user types what they
 *   heard.
 * - `context`: a sentence with the target word blanked out is shown; the
 *   user types the missing word.
 */
export type PracticeMode = 'visual' | 'dictation' | 'context';

/**
 * SRS "box" a word currently lives in for a given user, following a
 * Leitner-style 5-box system.
 *
 * 1 = short-term / just introduced, 5 = mastered / longest review interval.
 * See {@link getNextBox} in `srs-rules.ts` for the promotion/demotion rules.
 */
export type SrsBox = 1 | 2 | 3 | 4 | 5;

/**
 * A single vocabulary word and its associated learning metadata.
 *
 * Vocabulary content itself (the populated word list) is owned elsewhere;
 * this interface only defines the shape.
 */
export interface Word {
  /** Stable unique identifier for the word. */
  id: string;
  /** The English word or short phrase to be typed. */
  text: string;
  /** CEFR difficulty level of this word. */
  cefrLevel: CefrLevel;
  /** Identifier of the topic/category this word belongs to (e.g. "food"). */
  topicId: string;
  /** Vietnamese display name of the topic (e.g. "Đồ ăn"). */
  topicNameVi: string;
  /** Part of speech (e.g. "noun", "verb", "adjective"). */
  partOfSpeech: string;
  /** Vietnamese meaning of the word, shown in `visual` mode. */
  meaningVi: string;
  /** An example sentence using the word; the basis for `context` mode. */
  exampleSentence: string;
  /** Emoji or icon hint used to visually represent the word. */
  iconHint: string;
}

/**
 * A single user's spaced-repetition progress on a single word.
 *
 * One row per (userId, wordId) pair. Drives which words are "due" for
 * review and in which SRS box a word currently sits.
 */
export interface UserWordProgress {
  /** Stable unique identifier for this progress record. */
  id: string;
  /** Owning user's id. */
  userId: string;
  /** The word this progress record tracks. */
  wordId: string;
  /** Current SRS box (1-5) for this word/user. */
  srsBox: SrsBox;
  /** Total number of correct attempts recorded for this word. */
  timesCorrect: number;
  /** Total number of incorrect attempts recorded for this word. */
  timesWrong: number;
  /** Timestamp of the most recent review, or null if never reviewed. */
  lastReviewedAt: Date | null;
  /** Timestamp at which this word next becomes due for review. */
  nextDueAt: Date;
}

/**
 * A single logged attempt at typing a word during a practice session.
 */
export interface PracticeAttempt {
  /** Stable unique identifier for this attempt. */
  id: string;
  /** User who made the attempt. */
  userId: string;
  /** Word that was being practiced. */
  wordId: string;
  /** Practice mode used for this attempt. */
  mode: PracticeMode;
  /** Typing speed in words per minute for this attempt. */
  wpm: number;
  /** Accuracy of the typed input, 0-100. */
  accuracyPercent: number;
  /** Time taken to complete the attempt, in milliseconds. */
  timeMs: number;
  /** Whether the attempt was ultimately correct. */
  correct: boolean;
  /** When this attempt was recorded. */
  createdAt: Date;
}

/**
 * A single question/answer pair within an adaptive entrance assessment.
 */
export interface AssessmentAnswer {
  /** Zero-based index of the question within the assessment (0-4). */
  questionIndex: number;
  /**
   * Difficulty of the question that was asked, on an implementation-defined
   * scale (e.g. 1-6, mirroring CEFR levels). Increases after a correct
   * answer and decreases after a wrong one.
   */
  difficulty: number;
  /** Whether the user answered this question correctly. */
  correct: boolean;
}

/**
 * The outcome of a completed adaptive entrance assessment (5 multiple
 * choice questions) used to place a new user into a starting track.
 */
export interface AssessmentResult {
  /** User who took the assessment. */
  userId: string;
  /** The five question/answer records, in order, forming a difficulty trajectory. */
  answers: AssessmentAnswer[];
  /** The CEFR track suggested as a starting point based on the trajectory. */
  suggestedTrack: CefrTrack;
  /** When the assessment was completed. */
  createdAt: Date;
}

/**
 * A registered user of the app.
 */
export interface User {
  /** Stable unique identifier for the user. */
  id: string;
  /** User's email address. */
  email: string;
  /** Account creation timestamp. */
  createdAt: Date;
  /**
   * Minutes per day the user committed to during onboarding. Used to derive
   * the daily new-word cap via {@link computeDailyNewWordCap}.
   */
  minutesPerDay: number;
  /**
   * Optional manual override for the daily new-word cap, taking precedence
   * over the value derived from `minutesPerDay` when set.
   */
  newWordCapOverride?: number;
}
