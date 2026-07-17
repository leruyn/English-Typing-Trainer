/**
 * Rate limiters for the three Gemini-backed routes (`server/src/lib/gemini.ts`
 * callers). These exist purely to bound the cost/abuse surface of the
 * Gemini API key - every one of these routes makes a real, billed call to
 * Google, so an unbounded/looping client (or someone probing the endpoint
 * directly) can run up real cost even though the key itself is never
 * exposed to clients.
 *
 * Requires `app.set('trust proxy', ...)` in index.ts - Render sits behind a
 * reverse proxy, so without it every request looks like it comes from the
 * same IP (the proxy's), which would make `assessmentQuestionLimiter`
 * effectively a single shared bucket for all users instead of one per
 * visitor.
 */
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * `POST /assessment/question` runs during first-time onboarding, before an
 * account/token exists (see `server/src/routes/assessment.ts`), so this is
 * the one AI route with no authenticated user to key off - limited per IP
 * instead. A real assessment only needs 5 questions; 30 per 15 minutes
 * comfortably covers someone retrying/restarting the flow a few times
 * without leaving room for a scripted loop.
 */
export const assessmentQuestionLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assessment questions requested - please slow down and try again shortly.' },
});

/**
 * Keys a rate limiter by the authenticated user id (set by `requireAuth`,
 * which must run before this middleware in the route chain) rather than IP
 * - multiple users on the same NAT/network shouldn't share one bucket, and
 * a single compromised/scripted account should still be bounded per-user.
 */
function byUserId(req: Request): string {
  return req.userId ?? 'anonymous';
}

/** `POST /ai/explain` (vocabulary tutor chat) - generous enough for normal study use, not for scripted hammering. */
export const explainLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUserId,
  message: { error: 'You have asked the AI tutor too many questions this hour - please try again later.' },
});

/**
 * `GET /stats/coaching` is additionally cached server-side per user (see
 * `computeStats`/the coaching route in stats.ts), so this should rarely
 * even be hit - kept low as defense-in-depth in case the cache is ever
 * bypassed or a client polls the endpoint directly.
 */
export const coachingLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUserId,
  message: { error: 'Coaching insights refresh at most a few times per hour - please try again later.' },
});
