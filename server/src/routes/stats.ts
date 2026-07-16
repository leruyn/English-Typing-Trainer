/**
 * GET /stats — aggregate progress stats for the current user: mastery
 * percentage, current daily practice streak, total XP, and SRS box
 * distribution.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * XP awarded per correct attempt, weighted by the word's *current* SRS box.
 * Words that have climbed further up the Leitner ladder represent more
 * durable, harder-won recall, so each correct rep on them is worth more.
 * We don't record the box a word was in at the time of each individual
 * attempt, so this is an approximation using the word's present-day box
 * rather than a true historical replay.
 *
 * Chosen to double per box (1, 2, 4, 8, 16) so mastery is rewarded
 * noticeably more than early repetitions, without one box dwarfing all
 * others.
 */
const XP_PER_BOX: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

function toUtcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Computes the current consecutive-day practice streak from a list of
 * `PracticeAttempt.createdAt` timestamps.
 *
 * Streak = number of consecutive calendar days (UTC) with at least one
 * attempt, counting backward from today. If there's no attempt today, we
 * still count the streak as "current" as long as there was an attempt
 * yesterday (a one-day grace period, since a user's streak shouldn't look
 * broken before they've had a chance to practice today) — but if the most
 * recent attempt is from more than a day ago, the streak has lapsed and is
 * reported as 0.
 */
function computeCurrentStreak(attemptDates: Date[]): number {
  if (attemptDates.length === 0) {
    return 0;
  }

  const uniqueDays = Array.from(new Set(attemptDates.map((d) => toUtcDayStart(d)))).sort(
    (a, b) => b - a,
  );

  const todayStart = toUtcDayStart(new Date());
  const mostRecentDay = uniqueDays[0];

  if (mostRecentDay !== todayStart && mostRecentDay !== todayStart - ONE_DAY_MS) {
    // Most recent practice was more than a day ago: streak has lapsed.
    return 0;
  }

  let streak = 0;
  let expected = mostRecentDay;
  for (const day of uniqueDays) {
    if (day === expected) {
      streak += 1;
      expected -= ONE_DAY_MS;
    } else {
      break;
    }
  }
  return streak;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId as string;

    const [progressRows, attempts] = await Promise.all([
      prisma.userWordProgress.findMany({ where: { userId } }),
      prisma.practiceAttempt.findMany({ where: { userId }, select: { createdAt: true } }),
    ]);

    const totalAttempted = progressRows.length;
    const masteredCount = progressRows.filter((p) => p.srsBox === 5).length;
    const masteryPercent = totalAttempted > 0 ? (masteredCount / totalAttempted) * 100 : 0;

    const totalXp = progressRows.reduce(
      (sum, p) => sum + p.timesCorrect * (XP_PER_BOX[p.srsBox] ?? 1),
      0,
    );

    const boxDistribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const p of progressRows) {
      if (p.srsBox >= 1 && p.srsBox <= 5) {
        boxDistribution[p.srsBox as 1 | 2 | 3 | 4 | 5] += 1;
      }
    }

    const currentStreak = computeCurrentStreak(attempts.map((a) => a.createdAt));

    res.json({
      masteryPercent,
      totalXp,
      currentStreak,
      boxDistribution,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
