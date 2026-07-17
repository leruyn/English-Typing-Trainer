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

export function fetchWords(params?: { cefrLevel?: CefrLevel; topicId?: string }): Promise<{
  words: Word[];
}> {
  const query = new URLSearchParams();
  if (params?.cefrLevel) query.set("cefrLevel", params.cefrLevel);
  if (params?.topicId) query.set("topicId", params.topicId);
  const qs = query.toString();
  return apiFetch<{ words: Word[] }>(`/words${qs ? `?${qs}` : ""}`);
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
