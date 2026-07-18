/**
 * Builds the ordered list of words to serve in a practice session,
 * enforcing the review-priority + daily new-word-cap rules from
 * `@art/shared`:
 *
 * 1. Words already due for SRS review (from `/progress`) always come
 *    first, oldest-due first - reviewing what's already been seen takes
 *    priority over introducing new vocabulary.
 * 2. Brand-new words (no progress record yet) fill the rest of the
 *    session, up to `throttleNewWordsForReviewLoad(computeDailyNewWordCap(
 *    user.minutesPerDay), dueCount)` - and that cap is tracked per
 *    calendar day in AsyncStorage (`dailyNewWordTracker.ts`), so it holds
 *    across app restarts, not just within one open session.
 * 3. If both pools are empty (a word bank fully reviewed with nothing due
 *    - or offline with no cached data at all), falls back to cycling
 *    through every available word so practice is never blocked outright.
 */
import { useEffect, useMemo, useState } from "react";

import type { Word } from "@art/shared";
import {
  CEFR_LEVEL_TO_TRACK,
  computeDailyNewWordCap,
  throttleNewWordsForReviewLoad,
} from "@art/shared";
import { useAuth } from "../context/AuthContext";
import { useProgressQuery, useWordsQuery } from "../api/hooks";
import { getNewWordsIntroducedToday, recordNewWordIntroduced } from "../offline/dailyNewWordTracker";

export function usePracticeQueue() {
  const { user } = useAuth();
  const wordsQuery = useWordsQuery();
  const progressQuery = useProgressQuery();

  const [introducedToday, setIntroducedToday] = useState<string[] | null>(null);

  useEffect(() => {
    getNewWordsIntroducedToday().then(setIntroducedToday);
  }, []);

  const allWords = wordsQuery.data?.words ?? [];
  // NEW words are drawn from the user's current CEFR track (the whole
  // point of placement - a beginner shouldn't be fed C1 vocabulary, an
  // advanced learner shouldn't grind "cat"). Words the user has already
  // started (due reviews) are looked up against the unfiltered list below,
  // so a track change never orphans in-progress SRS reviews from the old
  // track. Falls back to the full bank if the track filter would leave
  // nothing (e.g. older cached data with missing cefrLevel fields).
  const currentTrack = user?.currentTrack ?? "beginner";
  const trackWords = allWords.filter((w) => CEFR_LEVEL_TO_TRACK[w.cefrLevel] === currentTrack);
  const words = trackWords.length > 0 ? trackWords : allWords;
  const progress = progressQuery.data?.progress ?? [];

  const queue = useMemo<Word[]>(() => {
    if (words.length === 0 || introducedToday === null) return [];

    const progressByWordId = new Map(progress.map((p) => [p.wordId, p]));

    // Due reviews resolve against the UNFILTERED word list: a word started
    // under a previous track still needs its scheduled reviews even after
    // the user moves tracks - SRS memory maintenance doesn't stop because
    // the difficulty target changed.
    const dueWords = progress
      .filter((p) => p.isDue)
      .slice()
      .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())
      .map((p) => allWords.find((w) => w.id === p.wordId))
      .filter((w): w is Word => Boolean(w));

    const candidateNewWords = words.filter((w) => !progressByWordId.has(w.id));

    const baseCap = computeDailyNewWordCap(user?.minutesPerDay ?? 10);
    const throttledCap = throttleNewWordsForReviewLoad(baseCap, dueWords.length);
    const remainingCapToday = Math.max(0, throttledCap - introducedToday.length);

    // Prefer words already picked earlier today (so refetches/restarts
    // don't reshuffle which new words are "in progress" for the day)
    // before spending the remaining cap on further-untouched words.
    const alreadyChosenToday = candidateNewWords.filter((w) => introducedToday.includes(w.id));
    const freshCandidates = candidateNewWords.filter((w) => !introducedToday.includes(w.id));
    const newWords = [...alreadyChosenToday, ...freshCandidates].slice(
      0,
      Math.max(alreadyChosenToday.length, alreadyChosenToday.length + remainingCapToday),
    );

    const sessionQueue = [...dueWords, ...newWords];
    if (sessionQueue.length > 0) return sessionQueue;

    // Nothing due and no new-word budget left (or no progress data at
    // all, e.g. very first launch offline) - fall back to the full bank
    // so the screen always has something to practice.
    return words;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWords, words, progress, introducedToday, user?.minutesPerDay, currentTrack]);

  // Persist any newly-selected new words as "introduced today" so the cap
  // holds even if the app is closed mid-session.
  useEffect(() => {
    if (introducedToday === null) return;
    const progressByWordId = new Map(progress.map((p) => [p.wordId, p]));
    const newlyIntroduced = queue.filter(
      (w) => !progressByWordId.has(w.id) && !introducedToday.includes(w.id),
    );
    if (newlyIntroduced.length === 0) return;

    setIntroducedToday((prev) => [...(prev ?? []), ...newlyIntroduced.map((w) => w.id)]);
    for (const w of newlyIntroduced) {
      void recordNewWordIntroduced(w.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  return {
    queue,
    isLoading: wordsQuery.isLoading || progressQuery.isLoading || introducedToday === null,
    isError: wordsQuery.isError,
  };
}
