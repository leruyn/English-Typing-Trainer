/**
 * Pure, side-effect-free functions implementing the spaced-repetition (SRS)
 * box transitions and adaptive daily pacing rules.
 *
 * These functions intentionally perform no I/O (no DB, no dates-as-clock
 * reads) so they can be unit tested with plain input/output assertions.
 */

import type { SrsBox } from './types';

/** Minimum valid SRS box. */
const MIN_BOX: SrsBox = 1;
/** Maximum valid SRS box (mastered). */
const MAX_BOX: SrsBox = 5;

/**
 * Typing time (ms) below which an attempt is considered "fast enough" to
 * count toward promotion. Chosen as a generous-but-not-lax threshold for a
 * single word: ~3.5s covers reading the prompt, recalling the word, and
 * typing it, without rewarding hesitant recall.
 */
const PROMOTE_TIME_MS = 3500;

/**
 * Accuracy (%) at or above which an attempt is considered accurate enough
 * to count toward promotion. 95% allows for a single minor typo on longer
 * words while still requiring near-perfect recall.
 */
const PROMOTE_ACCURACY_PERCENT = 95;

/**
 * Accuracy (%) below which an attempt is considered a poor-enough recall to
 * force demotion, regardless of speed. Below 85% indicates the word is not
 * reliably known and needs more frequent review.
 */
const DEMOTE_ACCURACY_PERCENT = 85;

/**
 * Typing time (ms) above which an attempt is considered slow enough to
 * force demotion, regardless of accuracy. 6.5s indicates significant
 * hesitation/struggle to recall the word even if eventually typed correctly.
 */
const DEMOTE_TIME_MS = 6500;

/**
 * Computes the next SRS box for a word given the outcome of the most recent
 * practice attempt.
 *
 * Rules (evaluated in order):
 * 1. Promote (box + 1, capped at 5) if the attempt was fast
 *    (`timeMs < 3500`) AND accurate (`accuracyPercent >= 95`).
 * 2. Demote (box - 1, floored at 1) if the attempt was inaccurate
 *    (`accuracyPercent < 85`) OR slow (`timeMs > 6500`).
 * 3. Otherwise, the box is unchanged.
 *
 * Promotion requires both speed and accuracy to be good (conjunction),
 * while demotion is triggered by either being bad (disjunction) — a single
 * red flag (too slow, or too inaccurate) is enough to push a word back into
 * more frequent review, but earning a shorter review interval requires
 * clearing both bars.
 *
 * @param currentBox current SRS box (1-5) the word is in
 * @param timeMs time taken to complete the attempt, in milliseconds
 * @param accuracyPercent accuracy of the attempt, 0-100
 * @returns the SRS box (1-5) the word should move to
 */
export function getNextBox(
  currentBox: SrsBox,
  timeMs: number,
  accuracyPercent: number,
): SrsBox {
  const shouldPromote = timeMs < PROMOTE_TIME_MS && accuracyPercent >= PROMOTE_ACCURACY_PERCENT;
  const shouldDemote = accuracyPercent < DEMOTE_ACCURACY_PERCENT || timeMs > DEMOTE_TIME_MS;

  if (shouldPromote) {
    return Math.min(MAX_BOX, currentBox + 1) as SrsBox;
  }
  if (shouldDemote) {
    return Math.max(MIN_BOX, currentBox - 1) as SrsBox;
  }
  return currentBox;
}

/**
 * Computes how many brand-new words a user should be introduced to in a
 * single day, based on how many minutes/day they committed to during
 * onboarding.
 *
 * The mapping is a smooth, monotonically increasing curve anchored on a
 * few reference points from product guidance:
 *   - 5 min/day  -> ~5 new words
 *   - 10 min/day -> ~10 new words
 *   - 15 min/day -> ~15-18 new words
 *   - 20+ min/day -> ~20-25 new words
 *
 * Rather than hard-coding a lookup table (which would produce visible
 * "steps" for minute values between the anchors, e.g. 12 or 17 minutes),
 * we model new-word throughput as piecewise-linear with a slope that
 * gradually decreases (diminishing returns) as committed study time grows,
 * since in practice a learner's per-word review budget increasingly
 * dominates session time once new-word intake is already non-trivial:
 *
 *   cap = minutes                              for minutes in [0, 10]   (slope 1.0)
 *   cap = 10 + (minutes - 10) * 1.2             for minutes in (10, 15]  (slope 1.2)
 *   cap = 16 + (minutes - 15) * 1.2             for minutes in (15, 20]  (slope 1.2)
 *   cap = 22 + (minutes - 20) * 0.3, capped 25  for minutes > 20         (slope 0.3)
 *
 * This produces cap(5)=5, cap(10)=10, cap(15)=16 (inside the 15-18
 * guidance band), cap(20)=22 (inside the 20-25 guidance band), and
 * asymptotically approaches a practical ceiling of 25 new words/day for
 * larger minute values - beyond that, review load (not new-word intake)
 * should dominate a session.
 *
 * @param minutesPerDay minutes/day the user committed to during onboarding
 * @returns suggested number of brand-new words to introduce that day (integer, >= 1)
 */
export function computeDailyNewWordCap(minutesPerDay: number): number {
  const minutes = Math.max(0, minutesPerDay);

  let cap: number;
  if (minutes <= 10) {
    // 0-10 minutes: ~1 new word per minute (5 -> 5, 10 -> 10).
    cap = minutes;
  } else if (minutes <= 15) {
    // 10-15 minutes: slightly steeper slope so 15 min lands at 16,
    // inside the 15-18 target band.
    cap = 10 + (minutes - 10) * 1.2;
  } else if (minutes <= 20) {
    // 15-20 minutes: same slope continues, landing at 22 at 20 minutes,
    // inside the 20-25 target band.
    cap = 16 + (minutes - 15) * 1.2;
  } else {
    // 20+ minutes: diminishing returns, asymptotically approaching a
    // practical ceiling of 25 new words/day.
    cap = 22 + (minutes - 20) * 0.3;
  }

  return Math.max(1, Math.min(25, Math.round(cap)));
}

/**
 * Threshold for the number of due review words in a day considered "heavy".
 * Above this, review load should take priority over introducing new words.
 */
const HEAVY_REVIEW_LOAD_THRESHOLD = 30;

/**
 * Factor by which the new-word cap is reduced when the day's review load is
 * heavy.
 */
const HEAVY_REVIEW_LOAD_REDUCTION_FACTOR = 0.5;

/**
 * Reduces a user's base daily new-word cap when they already have a heavy
 * load of due review words that day.
 *
 * Reviewing previously-seen words takes priority over introducing new
 * ones: cramming in new vocabulary on top of a big backlog of due reviews
 * risks overwhelming the learner and hurting retention of both old and new
 * material. When `dueReviewCount` exceeds `HEAVY_REVIEW_LOAD_THRESHOLD`
 * (30), the new-word cap is halved (rounded down, floored at 0) so the
 * session stays focused on catching up on reviews.
 *
 * @param baseCap the un-throttled new-word cap (e.g. from {@link computeDailyNewWordCap})
 * @param dueReviewCount number of words due for review today (uncapped)
 * @returns the (possibly reduced) new-word cap to use for today's session
 */
export function throttleNewWordsForReviewLoad(baseCap: number, dueReviewCount: number): number {
  if (dueReviewCount > HEAVY_REVIEW_LOAD_THRESHOLD) {
    return Math.max(0, Math.floor(baseCap * HEAVY_REVIEW_LOAD_REDUCTION_FACTOR));
  }
  return baseCap;
}
