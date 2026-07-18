/**
 * Typed functions for every route exposed by `server/src/routes/*.ts`.
 *
 * JSON has no `Date` type, so fields typed `Date` in `@art/shared` arrive
 * over the wire as ISO date strings — the `Wire*` types below mirror the
 * shared domain types but with those fields narrowed to `string`, so
 * callers aren't lied to about what `JSON.parse` actually produces.
 */
import type {
  AssessmentAnswer,
  CefrLevel,
  CefrTrack,
  LearnerGroup,
  PracticeMode,
  SrsBox,
  User,
  Word,
} from "@art/shared";
import { apiFetch } from "./client";

export type WireUser = Omit<User, "createdAt"> & { createdAt: string };

export interface WireUserWordProgress {
  id: string;
  userId: string;
  wordId: string;
  srsBox: SrsBox;
  timesCorrect: number;
  timesWrong: number;
  lastReviewedAt: string | null;
  nextDueAt: string;
  isDue: boolean;
  word: Word;
}

export interface StatsResponse {
  masteryPercent: number;
  totalXp: number;
  currentStreak: number;
  boxDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  /** 84 daily attempt counts, oldest day first, today last (12-week activity heatmap). */
  activityLast12Weeks: number[];
  /** Distinct words practiced per week for the last 7 weeks, oldest first. */
  wordsPerWeek: number[];
}

interface AuthResponse {
  token: string;
  user: WireUser;
}

// --- auth -------------------------------------------------------------

export function registerRequest(params: {
  email: string;
  password: string;
  minutesPerDay?: number;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: params,
    auth: false,
  });
}

export function loginRequest(params: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: params,
    auth: false,
  });
}

// --- words --------------------------------------------------------------

export interface FetchWordsParams {
  cefrLevel?: CefrLevel;
  topicId?: string;
  partOfSpeech?: string;
  /** Free-text search, matched server-side against the word or its Vietnamese meaning. */
  search?: string;
  /** Page size; server clamps to a max of 100. */
  limit?: number;
  offset?: number;
}

export interface FetchWordsResponse {
  words: Word[];
  total: number;
  hasMore: boolean;
}

/**
 * `/words` is paginated (default page size 50) rather than returning the
 * whole ~4900-word table in one response — see `server/src/routes/words.ts`
 * for why. Callers that page through results should use
 * `useWordsInfiniteQuery` (`hooks.ts`) rather than calling this directly.
 */
export function fetchWords(params?: FetchWordsParams): Promise<FetchWordsResponse> {
  const query = new URLSearchParams();
  if (params?.cefrLevel) query.set("cefrLevel", params.cefrLevel);
  if (params?.topicId) query.set("topicId", params.topicId);
  if (params?.partOfSpeech) query.set("partOfSpeech", params.partOfSpeech);
  if (params?.search) query.set("search", params.search);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiFetch<FetchWordsResponse>(`/words${qs ? `?${qs}` : ""}`);
}

export interface WordTopic {
  topicId: string;
  topicNameVi: string;
  cefrLevel: CefrLevel;
  wordCount: number;
}

/**
 * Lightweight topic list (topicId/topicNameVi/cefrLevel/count) for populating
 * the Vault screen's topic filter chips, without pulling every word just to
 * read distinct topics off them.
 */
export function fetchWordTopics(): Promise<{ topics: WordTopic[] }> {
  return apiFetch<{ topics: WordTopic[] }>("/words/topics");
}

// --- progress -----------------------------------------------------------

export function fetchProgress(): Promise<{ progress: WireUserWordProgress[] }> {
  return apiFetch<{ progress: WireUserWordProgress[] }>("/progress");
}

export interface SubmitAttemptParams {
  wordId: string;
  mode: PracticeMode;
  wpm: number;
  accuracyPercent: number;
  timeMs: number;
  correct: boolean;
}

export function submitAttempt(
  params: SubmitAttemptParams,
  token?: string,
): Promise<{ progress: WireUserWordProgress }> {
  return apiFetch<{ progress: WireUserWordProgress }>("/progress/attempt", {
    method: "POST",
    body: params,
    token,
  });
}

// --- assessment -----------------------------------------------------------

export interface SubmitAssessmentResponse {
  suggestedTrack: CefrTrack;
  hasCompletedAssessment: true;
  currentTrack: CefrTrack;
}

export function submitAssessment(
  answers: AssessmentAnswer[],
  learnerGroup?: LearnerGroup,
  token?: string,
): Promise<SubmitAssessmentResponse> {
  return apiFetch<SubmitAssessmentResponse>("/assessment", {
    method: "POST",
    body: { answers, ...(learnerGroup ? { learnerGroup } : {}) },
    token,
  });
}

/**
 * The no-test onboarding path for young children - see
 * `POST /assessment/skip` in `server/src/routes/assessment.ts`. Marks the
 * account as assessed and places it on the beginner track.
 */
export function skipAssessment(learnerGroup: LearnerGroup): Promise<SubmitAssessmentResponse> {
  return apiFetch<SubmitAssessmentResponse>("/assessment/skip", {
    method: "POST",
    body: { learnerGroup },
  });
}

// --- placement calibration -------------------------------------------

export interface CalibrationResponse {
  suggestion: "promote" | "demote" | null;
  suggestedTrack?: CefrTrack | null;
  currentTrack: CefrTrack;
  sampleSize?: number;
}

/**
 * Advisory check of whether recent real practice performance says the
 * current track is too easy/too hard - see `GET /progress/calibration`.
 */
export function fetchCalibration(): Promise<CalibrationResponse> {
  return apiFetch<CalibrationResponse>("/progress/calibration");
}

/** Sets the user's current CEFR track (accepting a calibration suggestion). */
export function updateTrack(track: CefrTrack): Promise<{ currentTrack: CefrTrack }> {
  return apiFetch<{ currentTrack: CefrTrack }>("/progress/track", {
    method: "POST",
    body: { track },
  });
}

// --- stats -----------------------------------------------------------

export function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>("/stats");
}

/**
 * AI-generated (Gemini) personalized note derived from the same numbers
 * `fetchStats` returns - see `server/src/routes/stats.ts`'s `/stats/coaching`.
 * Kept as its own request (not a field returned by `fetchStats`) so the
 * Stats screen can render its charts immediately and let this slower call
 * fill in afterward.
 */
export function fetchCoachingMessage(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/stats/coaching");
}

// --- ai -----------------------------------------------------------

export interface ExplainWordParams {
  word: string;
  meaningVi: string;
  exampleSentence: string;
  question: string;
}

/** AI vocabulary tutor - see `server/src/routes/ai.ts`'s `POST /ai/explain`. */
export function explainWord(params: ExplainWordParams): Promise<{ answer: string }> {
  return apiFetch<{ answer: string }>("/ai/explain", { method: "POST", body: params });
}

export interface GeneratedAssessmentQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: number;
}

/**
 * Requests one AI-generated adaptive-assessment question at the given
 * difficulty - see `server/src/routes/assessment.ts`'s
 * `POST /assessment/question`. Callers should fall back to the local
 * static question bank on failure (this can 503 if Gemini is unavailable
 * or returns malformed JSON) since the entrance assessment must not be
 * blocked by an AI outage.
 */
export function generateAssessmentQuestion(params: {
  difficulty: number;
  excludePrompts: string[];
}): Promise<GeneratedAssessmentQuestion> {
  return apiFetch<GeneratedAssessmentQuestion>("/assessment/question", {
    method: "POST",
    body: params,
  });
}
