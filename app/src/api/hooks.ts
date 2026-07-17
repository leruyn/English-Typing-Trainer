/**
 * TanStack Query hooks wrapping `endpoints.ts`, offline-first via
 * `offlineCache.ts` for reads and the AsyncStorage queue (`attemptQueue.ts`)
 * for the one write that matters most while offline: practice attempts.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AssessmentAnswer, CefrLevel } from "@art/shared";
import { useAuth } from "../context/AuthContext";
import { enqueueAttempt, flushAttemptQueue } from "../offline/attemptQueue";
import { fetchWithOfflineCache } from "./offlineCache";
import { ApiError } from "./client";
import {
  explainWord,
  fetchCoachingMessage,
  fetchProgress,
  fetchStats,
  fetchWords,
  fetchWordTopics,
  submitAssessment,
  submitAttempt,
  type ExplainWordParams,
  type FetchWordsParams,
  type SubmitAttemptParams,
} from "./endpoints";

/**
 * Fetches an entire CEFR level's word pool in one shot (bounded per-level -
 * up to ~1363 words for the biggest level, B2 - well under the server's
 * `MAX_LIMIT`). Used by the practice queue/SRS picker and Time Attack mode,
 * both of which need to sample/shuffle over the *whole* pool for a level
 * rather than a page of it.
 *
 * Do NOT use this for the Vault screen: with no `cefrLevel` filter it would
 * again be requesting the whole ~4900-word table. Vault paginates instead,
 * via `useWordsInfiniteQuery` below.
 */
export function useWordsQuery(cefrLevel?: CefrLevel) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["words", cefrLevel ?? "all"],
    queryFn: () =>
      fetchWithOfflineCache(`art_cache_words_${cefrLevel ?? "all"}`, () =>
        fetchWords({ cefrLevel, limit: 2000 }),
      ),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export interface WordsInfiniteFilters {
  cefrLevel?: CefrLevel;
  topicId?: string;
  partOfSpeech?: string;
  search?: string;
}

const VAULT_PAGE_SIZE = 50;

/**
 * Paginated word list for the Vault (dictionary) screen. Each page fetches
 * `VAULT_PAGE_SIZE` words at a time from the server (filtered/searched
 * server-side), so the client never holds or renders more of the ~4900-word
 * table than the user has actually scrolled to.
 */
export function useWordsInfiniteQuery(filters: WordsInfiniteFilters) {
  const { isAuthenticated } = useAuth();
  const { cefrLevel, topicId, partOfSpeech, search } = filters;

  return useInfiniteQuery({
    queryKey: ["words", "infinite", cefrLevel ?? null, topicId ?? null, partOfSpeech ?? null, search ?? ""],
    queryFn: ({ pageParam }) => {
      const params: FetchWordsParams = {
        cefrLevel,
        topicId,
        partOfSpeech,
        search: search || undefined,
        limit: VAULT_PAGE_SIZE,
        offset: pageParam,
      };
      return fetchWords(params);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, page) => sum + page.words.length, 0);
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Lightweight topic metadata (topicId/topicNameVi/cefrLevel/count) for the
 * Vault screen's topic filter chips - avoids pulling every word just to
 * read distinct topics off them.
 */
export function useWordTopicsQuery() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["wordTopics"],
    queryFn: () => fetchWithOfflineCache("art_cache_word_topics", fetchWordTopics),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgressQuery() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["progress"],
    queryFn: () => fetchWithOfflineCache("art_cache_progress", fetchProgress),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

export function useStatsQuery() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchWithOfflineCache("art_cache_stats", fetchStats),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

/**
 * Submits one completed word's practice attempt. Always resolves (never
 * rejects for a network failure) so the calling screen can stay
 * optimistic about local UI state (star-burst, next word, etc.) even when
 * offline - a failed-to-reach-server attempt is transparently queued via
 * `attemptQueue.ts` instead of surfacing an error to the typing flow.
 */
export function useSubmitAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SubmitAttemptParams) => {
      try {
        const result = await submitAttempt(params);
        return { queued: false as const, result };
      } catch (err) {
        if (err instanceof ApiError && err.isNetworkError) {
          await enqueueAttempt(params);
          return { queued: true as const, result: null };
        }
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void flushAttemptQueue();
    },
  });
}

/**
 * Gemini-generated personalized coaching note (see `fetchCoachingMessage`).
 * Deliberately not run through `fetchWithOfflineCache` - unlike words/
 * progress/stats, there's no value in surfacing a stale AI note from a
 * past session if this request fails, so it just quietly stays absent
 * (the Stats screen hides the card entirely on error/loading, see
 * `app/(tabs)/stats.tsx`). Only one retry - an AI call that's going to
 * fail usually fails fast, no need to hammer it.
 */
export function useCoachingQuery() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["coaching"],
    queryFn: fetchCoachingMessage,
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useSubmitAssessment() {
  return useMutation({
    mutationFn: (answers: AssessmentAnswer[]) => submitAssessment(answers),
  });
}

/** AI vocabulary tutor (Gemini) - see `explainWord` / `POST /ai/explain`. */
export function useExplainWord() {
  return useMutation({
    mutationFn: (params: ExplainWordParams) => explainWord(params),
  });
}
