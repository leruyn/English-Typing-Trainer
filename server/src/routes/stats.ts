/**
 * GET /stats — aggregate progress stats for the current user: mastery
 * percentage, current daily practice streak, total XP, SRS box
 * distribution, a 12-week daily activity heatmap, and a 7-week "distinct
 * words practiced" trend - the last two back the Stats screen's activity
 * heatmap and weekly bar chart.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { generateGeminiText, getEnvInt } from '../lib/gemini';
import { coachingLimiter } from '../middleware/rateLimit';

// Was a hardcoded 300 - tight for "2-3 câu" plus a concrete improvement
// point. Raised to 500; overridable via GEMINI_COACHING_MAX_TOKENS.
const COACHING_MAX_OUTPUT_TOKENS = getEnvInt('GEMINI_COACHING_MAX_TOKENS', 500);

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

const HEATMAP_DAYS = 84; // 12 weeks x 7 days
const WEEKLY_TREND_WEEKS = 7;

/**
 * Builds the 84-day activity heatmap (oldest day first, today last) and the
 * 7-week "distinct words practiced" trend (oldest week first, current week
 * last) from a user's practice attempts. Both are derived client-side from
 * the same attempt list already needed for the streak calculation, rather
 * than issuing separate grouped queries - the per-user attempt volume this
 * app deals with (typing practice sessions, not high-frequency telemetry)
 * is small enough that looping in memory is simpler and plenty fast.
 */
function buildActivityAggregates(attempts: Array<{ createdAt: Date; wordId: string }>): {
  activityLast12Weeks: number[];
  wordsPerWeek: number[];
} {
  const todayStart = toUtcDayStart(new Date());
  const heatmapStart = todayStart - (HEATMAP_DAYS - 1) * ONE_DAY_MS;

  const activityLast12Weeks = new Array(HEATMAP_DAYS).fill(0) as number[];
  const weeklyWordSets: Array<Set<string>> = Array.from({ length: WEEKLY_TREND_WEEKS }, () => new Set());
  const weeklyTrendStart = todayStart - (WEEKLY_TREND_WEEKS * 7 - 1) * ONE_DAY_MS;

  for (const attempt of attempts) {
    const dayStart = toUtcDayStart(attempt.createdAt);

    if (dayStart >= heatmapStart && dayStart <= todayStart) {
      const idx = Math.round((dayStart - heatmapStart) / ONE_DAY_MS);
      activityLast12Weeks[idx] += 1;
    }

    if (dayStart >= weeklyTrendStart && dayStart <= todayStart) {
      const weekIdx = Math.min(
        WEEKLY_TREND_WEEKS - 1,
        Math.floor((dayStart - weeklyTrendStart) / (7 * ONE_DAY_MS)),
      );
      weeklyWordSets[weekIdx].add(attempt.wordId);
    }
  }

  return {
    activityLast12Weeks,
    wordsPerWeek: weeklyWordSets.map((set) => set.size),
  };
}

interface ComputedStats {
  masteryPercent: number;
  totalXp: number;
  currentStreak: number;
  boxDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  activityLast12Weeks: number[];
  wordsPerWeek: number[];
}

/**
 * All of `GET /stats`'s aggregation logic, pulled out into a standalone
 * function so `GET /stats/coaching` (below) can reuse the exact same
 * numbers to build its Gemini prompt instead of re-querying/re-deriving
 * them separately.
 */
async function computeStats(userId: string): Promise<ComputedStats> {
  const [progressRows, attempts] = await Promise.all([
    prisma.userWordProgress.findMany({ where: { userId } }),
    prisma.practiceAttempt.findMany({ where: { userId }, select: { createdAt: true, wordId: true } }),
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
  const { activityLast12Weeks, wordsPerWeek } = buildActivityAggregates(attempts);

  return {
    masteryPercent,
    totalXp,
    currentStreak,
    boxDistribution,
    activityLast12Weeks,
    wordsPerWeek,
  };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const stats = await computeStats(req.userId as string);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// How long a generated coaching note stays valid before we'll call Gemini
// again for the same user. The underlying stats (streak, mastery%, box
// distribution) don't meaningfully change within a day of normal practice,
// so re-generating on every Stats screen view would just burn API quota for
// a near-identical note. 12h means a user practicing morning and evening
// can still get a same-day refresh.
const COACHING_CACHE_MS = 12 * 60 * 60 * 1000;

/**
 * GET /stats/coaching — a short, personalized note generated by Gemini
 * from the same numbers `GET /stats` already computes (streak, mastery,
 * per-box distribution, 7-week practiced-words trend). Deliberately a
 * separate endpoint from `GET /stats` rather than a field on it: the Stats
 * screen should render its charts immediately from the fast DB-only
 * query, then load this slower AI-generated note in afterward rather than
 * blocking the whole screen on a Gemini round trip.
 *
 * Result is cached on the `User` row (`lastCoachingMessage`/`lastCoachingAt`)
 * for `COACHING_CACHE_MS` - both to keep Gemini cost/quota bounded and
 * because Render's free-tier instance spins down after ~15min idle, so an
 * in-memory-only cache would be lost between sessions anyway.
 */
router.get('/coaching', requireAuth, coachingLimiter, async (req, res, next) => {
  try {
    const userId = req.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastCoachingMessage: true, lastCoachingAt: true },
    });

    if (
      user?.lastCoachingMessage &&
      user.lastCoachingAt &&
      Date.now() - user.lastCoachingAt.getTime() < COACHING_CACHE_MS
    ) {
      res.json({ message: user.lastCoachingMessage, cached: true });
      return;
    }

    const stats = await computeStats(userId);

    const boxSummary = ([1, 2, 3, 4, 5] as const)
      .map((box) => `Hộp ${box}: ${stats.boxDistribution[box]} từ`)
      .join(', ');
    const trendSummary = stats.wordsPerWeek
      .map((count, i) => `Tuần ${i + 1}: ${count} từ`)
      .join(', ');

    const prompt = [
      'Bạn là một huấn luyện viên học từ vựng tiếng Anh, thân thiện và ngắn gọn.',
      'Dựa trên số liệu học tập sau đây của một người dùng, hãy viết đúng 2-3 câu nhận xét cá nhân hoá bằng tiếng Việt:',
      `- Chuỗi ngày học liên tiếp hiện tại: ${stats.currentStreak} ngày`,
      `- Tỉ lệ làm chủ từ vựng: ${stats.masteryPercent.toFixed(1)}%`,
      `- Phân bố theo hộp trí nhớ (SRS): ${boxSummary}`,
      `- Số từ luyện tập theo từng tuần trong 7 tuần gần nhất (tuần 7 là tuần này): ${trendSummary}`,
      '',
      'Yêu cầu: giọng văn động viên nhưng thẳng thắn, chỉ ra CỤ THỂ một điểm cần cải thiện nếu có (ví dụ nhóm hộp nào đang yếu, xu hướng có đang đi xuống không), không dùng markdown, không chào hỏi mở đầu, đi thẳng vào nhận xét.',
    ].join('\n');

    const message = await generateGeminiText(prompt, {
      temperature: 0.6,
      maxOutputTokens: COACHING_MAX_OUTPUT_TOKENS,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { lastCoachingMessage: message, lastCoachingAt: new Date() },
    });

    res.json({ message, cached: false });
  } catch (err) {
    next(err);
  }
});

export default router;
