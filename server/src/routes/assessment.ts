/**
 * POST /assessment — records the outcome of a completed 8-question adaptive
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
  answers: z.array(assessmentAnswerSchema).length(8),
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
 * Previous version only looked at the last two questions (and only the
 * correct ones among those), which threw away most of the signal from a
 * longer assessment and made the result sensitive to one lucky/unlucky
 * answer right at the end. This version instead takes a *recency-weighted
 * average across every answer*:
 *
 * 1. Each answer contributes a per-question ability estimate: if answered
 *    correctly, the learner can handle that question's `difficulty`; if
 *    answered incorrectly, we assume their true level is roughly one tier
 *    below it (clamped at 0) rather than just discarding the data point -
 *    a wrong answer is still evidence of where the ceiling is.
 * 2. Later questions are weighted more heavily (weight = 1-based question
 *    index), since the adaptive difficulty walk has had more steps to
 *    converge toward the learner's real level by the end of the test.
 * 3. The final estimate is the weighted average of all per-question
 *    estimates, bucketed the same way as before:
 *      <= 2  -> beginner (roughly A1-A2)
 *      <= 4  -> intermediate (roughly B1-B2)
 *      > 4   -> advanced (roughly C1-C2)
 *
 * Works for any assessment length (5, 8, or otherwise) since weights are
 * derived from position, not a hardcoded "last two" window.
 */
export function suggestTrack(answers: AssessmentAnswer[]): CefrTrack {
  if (answers.length === 0) {
    return 'beginner';
  }

  const sorted = [...answers].sort((a, b) => a.questionIndex - b.questionIndex);

  let weightedSum = 0;
  let weightTotal = 0;
  sorted.forEach((answer, i) => {
    const weight = i + 1;
    const estimate = answer.correct ? answer.difficulty : Math.max(0, answer.difficulty - 1);
    weightedSum += estimate * weight;
    weightTotal += weight;
  });

  const referenceDifficulty = weightedSum / weightTotal;

  if (referenceDifficulty <= 2) {
    return 'beginner';
  }
  if (referenceDifficulty <= 4) {
    return 'intermediate';
  }
  return 'advanced';
}

interface CefrCalibration {
  cefrLevel: string;
  /** Short Vietnamese descriptor of what belongs at this tier - mirrors the project's own CEFR pedagogy (see project instructions section II). */
  descriptor: string;
  /** A few real example words at exactly this tier, pulled from the same vocabulary the app itself teaches at this level - gives Gemini concrete anchors instead of guessing difficulty in the abstract. */
  anchorWords: string[];
}

/**
 * Maps the assessment's internal 1-6 difficulty scale to a CEFR level plus
 * calibration anchors for the question-generation prompt below. Difficulty
 * miscalibration was the main accuracy complaint with the AI-generated
 * questions - Gemini has no ground truth for "how hard is B2 vocabulary",
 * so anchoring it to concrete example words (drawn from the same tiers the
 * app's own static vocab bank uses) gives it a reference point instead of
 * leaving "B2" to its own judgment.
 */
const CEFR_CALIBRATION: Record<number, CefrCalibration> = {
  1: {
    cefrLevel: 'A1',
    descriptor: 'từ cực kỳ cơ bản, 1 âm tiết hoặc rất ngắn, dùng hàng ngày',
    anchorWords: ['cat', 'red', 'three', 'happy', 'book'],
  },
  2: {
    cefrLevel: 'A2',
    descriptor: 'từ thông dụng đơn giản, chủ đề quen thuộc (gia đình, nhà cửa, thời gian)',
    anchorWords: ['kitchen', 'weekend', 'teacher', 'garden', 'holiday'],
  },
  3: {
    cefrLevel: 'B1',
    descriptor: 'từ vựng bắt đầu trừu tượng hơn, chủ đề xã hội/công việc cơ bản',
    anchorWords: ['environment', 'achieve', 'decision', 'increase', 'opportunity'],
  },
  4: {
    cefrLevel: 'B2',
    descriptor: 'từ học thuật/công việc thông dụng, sắc thái nghĩa rõ ràng hơn A/B1',
    anchorWords: ['strategy', 'flexible', 'essential', 'sustainable', 'negotiate'],
  },
  5: {
    cefrLevel: 'C1',
    descriptor: 'từ vựng nâng cao, ít gặp trong giao tiếp hàng ngày, cần vốn từ học thuật',
    anchorWords: ['ambiguous', 'meticulous', 'reluctant', 'coherent', 'contemplate'],
  },
  6: {
    cefrLevel: 'C2',
    descriptor: 'từ vựng rất cao cấp/hiếm gặp, gần với trình độ bản xứ có học thức',
    anchorWords: ['ubiquitous', 'ephemeral', 'aesthetic', 'sophisticated', 'pragmatic'],
  },
};

/**
 * POST /assessment/question — generates one adaptive-assessment multiple-
 * choice question at the requested difficulty via Gemini, replacing the
 * small hardcoded 18-question bank the client used to draw from (see the
 * TODO that used to live in `app/(onboarding)/assessment.tsx`).
 *
 * Deliberately NOT behind `requireAuth`: the question itself carries no
 * user-specific data, so there's nothing to protect here, and keeping it
 * public means the entrance assessment doesn't hard-depend on the client
 * always having a fresh token by the time it's reached (rate-limited
 * separately below since it's the one AI route open without auth - see
 * `assessmentQuestionLimiter`).
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
    const calibration = CEFR_CALIBRATION[difficulty] ?? CEFR_CALIBRATION[1];
    const neighborBelow = CEFR_CALIBRATION[difficulty - 1];
    const neighborAbove = CEFR_CALIBRATION[difficulty + 1];

    const prompt = [
      `Tạo một câu hỏi trắc nghiệm tiếng Anh cho bài khảo sát trình độ CEFR, ĐÚNG mức độ ${calibration.cefrLevel} - không dễ hơn, không khó hơn.`,
      `Đặc điểm từ vựng ở mức ${calibration.cefrLevel}: ${calibration.descriptor}.`,
      `Ví dụ các từ ĐÚNG độ khó ${calibration.cefrLevel} (dùng làm mốc tham chiếu độ khó, không bắt buộc phải hỏi đúng các từ này): ${calibration.anchorWords.join(', ')}.`,
      neighborBelow
        ? `Câu hỏi phải khó hơn rõ rệt so với mức ${neighborBelow.cefrLevel} (ví dụ: ${neighborBelow.anchorWords.slice(0, 3).join(', ')}) - không được dùng từ dễ như vậy.`
        : '',
      neighborAbove
        ? `Câu hỏi phải dễ hơn rõ rệt so với mức ${neighborAbove.cefrLevel} (ví dụ: ${neighborAbove.anchorWords.slice(0, 3).join(', ')}) - không được dùng từ khó như vậy.`
        : '',
      'Câu hỏi phải kiểm tra nghĩa hoặc cách dùng một từ vựng tiếng Anh, hỏi bằng tiếng Việt, có đúng 4 phương án trả lời bằng tiếng Việt (hoặc tiếng Anh nếu phù hợp), chỉ một đáp án đúng.',
      '3 phương án sai (nhiễu) nên ở cùng tầm độ khó/từ loại với đáp án đúng - tránh nhiễu quá dễ loại trừ bằng suy luận thay vì bằng vốn từ.',
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

    const [assessmentResult] = await prisma.$transaction([
      prisma.assessmentResult.create({
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
      }),
      // Flips the User-level flag that gates onboarding routing (see
      // app/app/_layout.tsx / (onboarding)/account.tsx) - a retake overwrites
      // nothing here since it's already true, this only matters the first
      // time. Same transaction as the result insert so the two can't
      // diverge (e.g. result saved but flag update lost to a crash).
      prisma.user.update({ where: { id: userId }, data: { hasCompletedAssessment: true } }),
    ]);

    // Echo hasCompletedAssessment: true directly, rather than making the
    // client re-fetch/re-login to learn its own account flipped - it just
    // did, in the same transaction above.
    res.status(201).json({ suggestedTrack, assessmentResult, hasCompletedAssessment: true });
  } catch (err) {
    next(err);
  }
});

export default router;
