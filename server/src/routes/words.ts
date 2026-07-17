/**
 * Word routes.
 *
 * `GET /words` — paginated list of vocabulary words, filterable by CEFR
 * level, topic, part of speech, and a free-text search (matches the English
 * word or its Vietnamese meaning). Requires authentication (any logged-in
 * user can browse the shared word bank).
 *
 * With the vocabulary bank now at ~4900 words (up from the original ~200),
 * returning the entire table on every request became the main source of
 * slowness on both ends: a multi-MB JSON payload per fetch, an
 * AsyncStorage write of that whole blob on the client
 * (`fetchWithOfflineCache`), and — worst of all — a non-virtualized
 * `ScrollView` on the Vault screen rendering every row at once. This route
 * now paginates (default page size 50; see `MAX_LIMIT` below for the cap)
 * so the client only ever fetches/renders one page at a time; `GET
 * /words/topics` gives the Vault screen's topic filter chips a cheap way to
 * enumerate topics without pulling every word just to read off
 * `topicId`/`topicNameVi`.
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { cefrLevelSchema } from '@art/shared';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';

const router = Router();

const DEFAULT_LIMIT = 50;
/**
 * Upper bound on `limit`. Deliberately high (not e.g. 100): callers that
 * legitimately need a whole CEFR level's word pool in one shot (the
 * practice-queue/SRS picker and Time Attack mode both filter by `cefrLevel`
 * and pass an explicit large `limit` - see `useWordsQuery` in the client's
 * `hooks.ts`) top out around 1363 words for the biggest level (B2), so this
 * just needs to comfortably clear that; it's the *default* (unfiltered,
 * unpaged) case this route is guarding against, not bounded per-level reads.
 */
const MAX_LIMIT = 2000;

/** Parses a `limit`/`offset` query param into a non-negative integer, or throws a 400. */
function parseNonNegativeInt(value: unknown, paramName: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `Invalid ${paramName} query parameter`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, `${paramName} must be a non-negative integer`);
  }
  return parsed;
}

router.get('/topics', requireAuth, async (_req, res, next) => {
  try {
    const grouped = await prisma.word.groupBy({
      by: ['topicId', 'topicNameVi', 'cefrLevel'],
      _count: { _all: true },
      orderBy: { topicId: 'asc' },
    });

    const topics = grouped.map(
      (g: { topicId: string; topicNameVi: string; cefrLevel: string; _count: { _all: number } }) => ({
        topicId: g.topicId,
        topicNameVi: g.topicNameVi,
        cefrLevel: g.cefrLevel,
        wordCount: g._count._all,
      }),
    );

    res.json({ topics });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { cefrLevel, topicId, partOfSpeech, search } = req.query;
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

    if (partOfSpeech !== undefined) {
      if (typeof partOfSpeech !== 'string' || partOfSpeech.length === 0) {
        throw new HttpError(400, 'Invalid partOfSpeech query parameter');
      }
      where.partOfSpeech = partOfSpeech;
    }

    if (search !== undefined) {
      if (typeof search !== 'string' || search.trim().length === 0) {
        throw new HttpError(400, 'Invalid search query parameter');
      }
      const term = search.trim();
      where.OR = [
        { text: { contains: term, mode: 'insensitive' } },
        { meaningVi: { contains: term, mode: 'insensitive' } },
      ];
    }

    const limitParam = parseNonNegativeInt(req.query.limit, 'limit');
    const offsetParam = parseNonNegativeInt(req.query.offset, 'offset');
    const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT) || DEFAULT_LIMIT;
    const offset = offsetParam ?? 0;

    const [words, total] = await Promise.all([
      prisma.word.findMany({
        where,
        orderBy: [{ topicId: 'asc' }, { text: 'asc' }],
        skip: offset,
        take: limit,
      }),
      prisma.word.count({ where }),
    ]);

    res.json({ words, total, hasMore: offset + words.length < total });
  } catch (err) {
    next(err);
  }
});

export default router;
