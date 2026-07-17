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
import { generateGeminiText } from '../lib/gemini';

const router = Router();

const MAX_QUESTION_LENGTH = 300;

const explainSchema = z.object({
  word: z.string().min(1).max(100),
  meaningVi: z.string().max(500).optional().default(''),
  exampleSentence: z.string().max(500).optional().default(''),
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
});

router.post('/explain', requireAuth, async (req, res, next) => {
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
      'Trả lời ngắn gọn bằng tiếng Việt (tối đa khoảng 4-5 câu), tập trung đúng vào từ và câu hỏi trên, không lan man, không dùng markdown/danh sách, giọng văn gần gũi như đang giải thích trực tiếp cho học viên.',
    ]
      .filter(Boolean)
      .join('\n');

    const answer = await generateGeminiText(prompt, { temperature: 0.6, maxOutputTokens: 400 });
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

export default router;
