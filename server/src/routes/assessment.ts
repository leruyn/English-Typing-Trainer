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
import { generateGeminiJson, GeminiError, getEnvInt } from '../lib/gemini';
import { assessmentQuestionLimiter } from '../middleware/rateLimit';

// Structured JSON (prompt + 4 options), so needs less headroom than a
// free-text answer, but still raised slightly from 400 to reduce the odds
// of a truncated/invalid JSON tail. Overridable via GEMINI_ASSESSMENT_MAX_TOKENS.
const ASSESSMENT_MAX_OUTPUT_TOKENS = getEnvInt('GEMINI_ASSESSMENT_MAX_TOKENS', 500);

const router = Router();

const submitAssessmentSchema = z.object({
  answers: z.array(assessmentAnswerSchema).length(5),
});

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 6;
const MAX_EXCLUDE_PROMPTS = 30;

const generateQuestionSchema = z.object({
  difficulty: z.number().int().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY),
  // Prompts already asked this session, so Gemini doesn't repeat one - the
  // client sends its running list; capped defensively since this comes
  // from an unauthenticated caller (see the route below).
  excludePrompts: z.array(z.string()).max(MAX_EXCLUDE_PROMPTS).optional().default([]),
});

interface GeneratedQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
}

function isValidGeneratedQuestion(value: unknown): value is GeneratedQuestion {
  if (typeof value !== 'object' || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q.prompt === 'string' &&
    q.prompt.trim().length > 0 &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    q.options.every((o) => typeof o === 'string' && o.trim().length > 0) &&
    typeof q.correctIndex === 'number' &&
    Number.isInteger(q.correctIndex) &&
    q.correctIndex >= 0 &&
    q.correctIndex <= 3
  );
}

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

const CEFR_BY_DIFFICULTY: Record<number, string> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
};

/**
 * POST /assessment/question — generates one adaptive-assessment multiple-
 * choice question at the requested difficulty via Gemini, replacing the
 * small hardcoded 18-question bank the client used to draw from (see the
 * TODO that used to live in `app/(onboarding)/assessment.tsx`).
 *
 * Deliberately NOT behind `requireAuth`: this runs during first-time
 * onboarding, before an account exists (the assessment happens before
 * `account.tsx` creates the user and a token is issued) - the question
 * itself carries no user-specific data, so there's nothing to protect here.
 *
 * Falls back to letting the client use its local static question bank on
 * any failure (bad Gemini output, network error, etc.) via the 503 that
 * `generateGeminiJson`/`GeminiError` throws - the entrance assessment must
 * never be blocked by an AI outage.
 */
router.post('/question', assessmentQuestionLimiter, async (req, res, next) => {
  try {
    const parsed = generateQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { difficulty, excludePrompts } = parsed.data;
    const cefrLevel = CEFR_BY_DIFFICULTY[difficulty] ?? 'A1';

    const prompt = [
      `Tạo một câu hỏi trắc nghiệm tiếng Anh cho bài khảo sát trình độ CEFR, đúng mức độ ${cefrLevel}.`,
      'Câu hỏi phải kiểm tra nghĩa hoặc cách dùng một từ vựng tiếng Anh, hỏi bằng tiếng Việt, có đúng 4 phương án trả lời bằng tiếng Việt (hoặc tiếng Anh nếu phù hợp), chỉ một đáp án đúng.',
      excludePrompts.length > 0
        ? `Không được trùng hoặc quá giống các câu hỏi đã dùng: ${excludePrompts.join(' | ')}`
        : '',
      'Trả về JSON đúng theo cấu trúc sau, không thêm gì khác:',
      '{"prompt": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}',
      'Trong đó correctIndex là chỉ số (0-3) của đáp án đúng trong mảng options.',
    ]
      .filter(Boolean)
      .join('\n');

    const generated = await generateGeminiJson<unknown>(prompt, {
      temperature: 0.9,
      maxOutputTokens: ASSESSMENT_MAX_OUTPUT_TOKENS,
    });

    if (!isValidGeneratedQuestion(generated)) {
      throw new GeminiError('Gemini returned a malformed question');
    }

    res.json({
      prompt: generated.prompt,
      options: generated.options,
      correctIndex: generated.correctIndex,
      difficulty,
    });
  } catch (err) {
    next(err);
  }
});

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
