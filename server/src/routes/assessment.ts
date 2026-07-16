/**
 * POST /assessment — records the outcome of a completed 5-question adaptive
 * entrance assessment and computes a suggested starting `CefrTrack`.
 *
 * `suggestedTrack` is deliberately NOT accepted from the client (even
 * though `@art/shared`'s `createAssessmentResultSchema` includes it) — it's
 * computed server-side from the answer trajectory so a client can't just
 * self-report whatever track it wants.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AssessmentAnswer, CefrTrack } from '@art/shared';
import { assessmentAnswerSchema } from '@art/shared';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';

const router = Router();

const submitAssessmentSchema = z.object({
  answers: z.array(assessmentAnswerSchema).length(5),
});

/**
 * Heuristic used to bucket a completed assessment into a suggested starting
 * `CefrTrack`.
 *
 * The assessment is adaptive (difficulty rises after a correct answer,
 * falls after a wrong one), so by the last question or two the difficulty
 * should have roughly converged on the user's actual level. We therefore:
 *
 * 1. Look at the last two questions asked (index 3 and 4).
 * 2. If the user answered at least one of them correctly, average the
 *    `difficulty` of the correct answer(s) among those last two — this is
 *    the "converged" difficulty estimate.
 * 3. If neither of the last two was correct (the trajectory was still
 *    heading down at the end), fall back to the difficulty of the latest
 *    correct answer anywhere in the set, since that's the last point we
 *    know the user could actually handle.
 * 4. If nothing was answered correctly at all, default to the easiest
 *    track.
 *
 * `difficulty` is expected to be on a scale that roughly mirrors CEFR level
 * (e.g. 1-6 for A1-C2). The resulting average is bucketed as:
 *   <= 2  -> beginner (roughly A1-A2)
 *   <= 4  -> intermediate (roughly B1-B2)
 *   > 4   -> advanced (roughly C1-C2)
 */
export function suggestTrack(answers: AssessmentAnswer[]): CefrTrack {
  const sorted = [...answers].sort((a, b) => a.questionIndex - b.questionIndex);
  const lastTwo = sorted.slice(-2);
  const lastTwoCorrect = lastTwo.filter((a) => a.correct);

  let referenceDifficulty: number | null = null;

  if (lastTwoCorrect.length > 0) {
    referenceDifficulty =
      lastTwoCorrect.reduce((sum, a) => sum + a.difficulty, 0) / lastTwoCorrect.length;
  } else {
    const anyCorrect = sorted.filter((a) => a.correct);
    if (anyCorrect.length > 0) {
      referenceDifficulty = anyCorrect[anyCorrect.length - 1].difficulty;
    }
  }

  if (referenceDifficulty === null) {
    return 'beginner';
  }
  if (referenceDifficulty <= 2) {
    return 'beginner';
  }
  if (referenceDifficulty <= 4) {
    return 'intermediate';
  }
  return 'advanced';
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const parsed = submitAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { answers } = parsed.data;

    const questionIndexes = new Set(answers.map((a) => a.questionIndex));
    if (questionIndexes.size !== answers.length) {
      throw new HttpError(400, 'answers must have unique questionIndex values');
    }

    const suggestedTrack = suggestTrack(answers);

    const assessmentResult = await prisma.assessmentResult.create({
      data: {
        userId,
        suggestedTrack,
        answers: {
          create: answers.map((a) => ({
            questionIndex: a.questionIndex,
            difficulty: a.difficulty,
            correct: a.correct,
          })),
        },
      },
      include: { answers: { orderBy: { questionIndex: 'asc' } } },
    });

    res.status(201).json({ suggestedTrack, assessmentResult });
  } catch (err) {
    next(err);
  }
});

export default router;
