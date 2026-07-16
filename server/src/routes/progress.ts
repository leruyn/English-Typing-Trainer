/**
 * Progress routes: fetch a user's SRS progress, and record new practice
 * attempts which drive the SRS box transitions from `@art/shared`.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { SrsBox } from '@art/shared';
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

export default router;
