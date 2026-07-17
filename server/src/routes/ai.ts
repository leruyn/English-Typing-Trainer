/**
 * AI vocabulary tutor routes, backed by Gemini (`../lib/gemini`).
 *
 * `POST /ai/explain` — answers a free-text question about the word
 * currently being practiced (e.g. "phân biệt affect và effect", "cho ví dụ
 * khác"), grounded in that word's own meaning/example so the answer stays
 * relevant to what the learner is actually looking at.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../lib/errors';
import { generateGeminiText, getEnvInt } from '../lib/gemini';
import { explainLimiter } from '../middleware/rateLimit';

// Was a hardcoded 400 - too tight for a "4-5 câu" Vietnamese answer, often
// got cut off mid-sentence. Raised to 800; overridable via
// GEMINI_EXPLAIN_MAX_TOKENS in Render's Environment tab without a redeploy.
const EXPLAIN_MAX_OUTPUT_TOKENS = getEnvInt('GEMINI_EXPLAIN_MAX_TOKENS', 800);

const router = Router();

const MAX_QUESTION_LENGTH = 300;

const explainSchema = z.object({
  word: z.string().min(1).max(100),
  meaningVi: z.string().max(500).optional().default(''),
  exampleSentence: z.string().max(500).optional().default(''),
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
});

router.post('/explain', requireAuth, explainLimiter, async (req, res, next) => {
  try {
    const parsed = explainSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { word, meaningVi, exampleSentence, question } = parsed.data;

    const prompt = [
      'Bạn là một gia sư tiếng Anh thân thiện, đang giúp một người Việt học từ vựng tiếng Anh.',
      `Từ đang học: "${word}"${meaningVi ? ` (nghĩa: ${meaningVi})` : ''}`,
      exampleSentence ? `Câu ví dụ có sẵn: "${exampleSentence}"` : '',
      `Câu hỏi của người học: "${question}"`,
      '',
      'Trả lời CỰC KỲ ngắn gọn bằng tiếng Việt: tối đa 2 câu (chỉ 3 câu nếu thật sự cần một ví dụ ngắn), đi thẳng vào trọng tâm câu hỏi, không nhắc lại câu hỏi, không rào đón/chào hỏi mở đầu, không lan man, không dùng markdown/danh sách/emoji, giọng văn gần gũi như đang trả lời nhanh cho học viên trong lúc luyện gõ.',
    ]
      .filter(Boolean)
      .join('\n');

    const answer = await generateGeminiText(prompt, {
      temperature: 0.6,
      maxOutputTokens: EXPLAIN_MAX_OUTPUT_TOKENS,
    });
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

export default router;
