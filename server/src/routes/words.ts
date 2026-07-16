/**
 * GET /words — list vocabulary words, optionally filtered by CEFR level
 * and/or topic. Requires authentication (any logged-in user can browse the
 * shared word bank).
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { cefrLevelSchema } from '@art/shared';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { cefrLevel, topicId } = req.query;
    const where: Prisma.WordWhereInput = {};

    if (cefrLevel !== undefined) {
      const parsedLevel = cefrLevelSchema.safeParse(cefrLevel);
      if (!parsedLevel.success) {
        throw new HttpError(
          400,
          'Invalid cefrLevel query parameter; expected one of A1, A2, B1, B2, C1, C2',
        );
      }
      where.cefrLevel = parsedLevel.data;
    }

    if (topicId !== undefined) {
      if (typeof topicId !== 'string' || topicId.length === 0) {
        throw new HttpError(400, 'Invalid topicId query parameter');
      }
      where.topicId = topicId;
    }

    const words = await prisma.word.findMany({
      where,
      orderBy: [{ topicId: 'asc' }, { text: 'asc' }],
    });

    res.json({ words });
  } catch (err) {
    next(err);
  }
});

export default router;
