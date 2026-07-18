/**
 * Progress routes: fetch a user's SRS progress, and record new practice
 * attempts which drive the SRS box transitions from `@art/shared`.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { CefrTrack, SrsBox } from '@art/shared';
import { getNextBox, practiceModeSchema } from '@art/shared';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';

const router = Router();

/**
 * Review interval (in days) assigned to a word once it lands in a given SRS
 * box, following a simple fixed Leitner-style schedule:
 *   box 1 -> due again in 1 day
 *   box 2 -> due again in 3 days
 *   box 3 -> due again in 7 days
 *   box 4 -> due again in 14 days
 *   box 5 -> due again in 30 days
 * Boxes are 1-indexed (1 = just introduced, 5 = mastered), matching
 * `SrsBox` in `@art/shared`.
 */
const BOX_INTERVAL_DAYS: Record<SrsBox, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function computeNextDueAt(box: SrsBox, from: Date): Date {
  return new Date(from.getTime() + BOX_INTERVAL_DAYS[box] * ONE_DAY_MS);
}

function isSrsBox(value: number): value is SrsBox {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/**
 * Body for POST /progress/attempt. Mirrors
 * `createPracticeAttemptSchema` from `@art/shared` (which is
 * `practiceAttemptSchema` minus server-assigned `id`/`createdAt`), minus
 * `userId` since that comes from the authenticated session rather than the
 * request body.
 */
const recordAttemptSchema = z.object({
  wordId: z.string().min(1),
  mode: practiceModeSchema,
  wpm: z.number().min(0),
  accuracyPercent: z.number().min(0).max(100),
  timeMs: z.number().min(0),
  correct: z.boolean(),
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const rows = await prisma.userWordProgress.findMany({
      where: { userId },
      include: { word: true },
      orderBy: { nextDueAt: 'asc' },
    });

    const now = new Date();
    const progress = rows.map((row) => ({
      ...row,
      isDue: row.nextDueAt <= now,
    }));

    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

router.post('/attempt', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const parsed = recordAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { wordId, mode, wpm, accuracyPercent, timeMs, correct } = parsed.data;

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      throw new HttpError(404, `Word ${wordId} not found`);
    }

    const existing = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    const currentBox: SrsBox = existing && isSrsBox(existing.srsBox) ? existing.srsBox : 1;
    const newBox = getNextBox(currentBox, timeMs, accuracyPercent);
    const now = new Date();
    const nextDueAt = computeNextDueAt(newBox, now);

    const progress = await prisma.userWordProgress.upsert({
      where: { userId_wordId: { userId, wordId } },
      create: {
        userId,
        wordId,
        srsBox: newBox,
        timesCorrect: correct ? 1 : 0,
        timesWrong: correct ? 0 : 1,
        lastReviewedAt: now,
        nextDueAt,
      },
      update: {
        srsBox: newBox,
        timesCorrect: { increment: correct ? 1 : 0 },
        timesWrong: { increment: correct ? 0 : 1 },
        lastReviewedAt: now,
        nextDueAt,
      },
    });

    await prisma.practiceAttempt.create({
      data: {
        userId,
        wordId,
        mode,
        wpm,
        accuracyPercent,
        timeMs,
        correct,
      },
    });

    res.status(200).json({ progress });
  } catch (err) {
    next(err);
  }
});

// --- continuous placement calibration ---------------------------------

/** Attempts examined when judging whether the current track still fits. */
const CALIBRATION_WINDOW = 30;
/** Don't suggest anything until there's at least this much recent data. */
const CALIBRATION_MIN_ATTEMPTS = 20;
/** Consistently near-perfect and the track is probably too easy... */
const PROMOTE_ACCURACY_THRESHOLD = 92;
/** ...while consistently struggling means it's probably too hard. */
const DEMOTE_ACCURACY_THRESHOLD = 65;

const TRACK_ORDER: CefrTrack[] = ['beginner', 'intermediate', 'advanced'];

/**
 * GET /progress/calibration — the third tier of placement: no 3-minute
 * entrance test measures level as well as days of real typing data does,
 * so the entrance placement is treated as provisional and this endpoint
 * checks whether accumulated practice performance says otherwise.
 *
 * Looks at the last `CALIBRATION_WINDOW` practice attempts:
 * - average accuracy >= 92% and >= 90% of attempts correct -> the current
 *   track is too easy; suggest promoting one track up (if not at the top).
 * - average accuracy < 65% -> too hard; suggest demoting one track down
 *   (if not already at the bottom).
 * - otherwise (or with fewer than `CALIBRATION_MIN_ATTEMPTS` attempts):
 *   no suggestion.
 *
 * Purely advisory: the client shows a one-tap banner and only
 * POST /progress/track (below) actually changes anything - the user stays
 * in control of their own level.
 */
router.get('/calibration', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentTrack: true },
    });
    const currentTrack = (user?.currentTrack ?? 'beginner') as CefrTrack;
    const trackIndex = TRACK_ORDER.indexOf(currentTrack);

    const attempts = await prisma.practiceAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: CALIBRATION_WINDOW,
      select: { accuracyPercent: true, correct: true },
    });

    if (attempts.length < CALIBRATION_MIN_ATTEMPTS) {
      res.json({ suggestion: null, currentTrack });
      return;
    }

    // Callback params typed explicitly (rather than inferred off the Prisma
    // result) so typechecking doesn't depend on the generated Prisma client
    // being present - matches the known `select` shape above.
    interface CalibrationAttempt {
      accuracyPercent: number;
      correct: boolean;
    }
    const avgAccuracy =
      attempts.reduce((sum: number, a: CalibrationAttempt) => sum + a.accuracyPercent, 0) /
      attempts.length;
    const correctRate =
      attempts.filter((a: CalibrationAttempt) => a.correct).length / attempts.length;

    let suggestion: 'promote' | 'demote' | null = null;
    let suggestedTrack: CefrTrack | null = null;

    if (avgAccuracy >= PROMOTE_ACCURACY_THRESHOLD && correctRate >= 0.9 && trackIndex < TRACK_ORDER.length - 1) {
      suggestion = 'promote';
      suggestedTrack = TRACK_ORDER[trackIndex + 1];
    } else if (avgAccuracy < DEMOTE_ACCURACY_THRESHOLD && trackIndex > 0) {
      suggestion = 'demote';
      suggestedTrack = TRACK_ORDER[trackIndex - 1];
    }

    res.json({ suggestion, suggestedTrack, currentTrack, sampleSize: attempts.length });
  } catch (err) {
    next(err);
  }
});

const updateTrackSchema = z.object({
  track: z.enum(['beginner', 'intermediate', 'advanced']),
});

/**
 * POST /progress/track — sets the user's current CEFR track. Called when
 * the user accepts a calibration suggestion (or manually changes level).
 * Free choice by design: the calibration endpoint above only advises, and
 * a learner who wants to study above/below their measured level should be
 * allowed to - motivation beats placement precision.
 */
router.post('/track', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const parsed = updateTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    }

    await prisma.user.update({
      where: { id: userId },
      data: { currentTrack: parsed.data.track },
    });

    res.json({ currentTrack: parsed.data.track });
  } catch (err) {
    next(err);
  }
});

export default router;
