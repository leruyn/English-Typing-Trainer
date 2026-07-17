/**
 * TanStack Query hooks wrapping `endpoints.ts`, offline-first via
 * `offlineCache.ts` for reads and the AsyncStorage queue (`attemptQueue.ts`)
 * for the one write that matters most while offline: practice attempts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AssessmentAnswer, CefrLevel } from "@art/shared";
import { useAuth } from "../context/AuthContext";
import { enqueueAttempt, flushAttemptQueue } from "../offline/attemptQueue";
import { fetchWithOfflineCache } from "./offlineCache";
import { ApiError } from "./client";
import {
  fetchProgress,
  fetchStats,
  fetchWords,
  submitAssessment,
  submitAttempt,
  type SubmitAttemptParams,
} from "./endpoints";

export function useWordsQuery(cefrLevel?: CefrLevel) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["words", cefrLevel ?? "all"],
    queryFn: () =>
      fetchWithOfflineCache(`art_cache_words_${cefrLevel ?? "all"}`, () => fetchWords({ cefrLevel })),
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

export function useSubmitAssessment() {
  return useMutation({
    mutationFn: (answers: AssessmentAnswer[]) => submitAssessment(answers),
  });
}
