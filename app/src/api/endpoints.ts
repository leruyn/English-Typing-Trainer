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

export function submitAssessment(
  answers: AssessmentAnswer[],
  token?: string,
): Promise<{ suggestedTrack: CefrTrack }> {
  return apiFetch<{ suggestedTrack: CefrTrack }>("/assessment", {
    method: "POST",
    body: { answers },
    token,
  });
}

// --- stats -----------------------------------------------------------

export function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>("/stats");
}
