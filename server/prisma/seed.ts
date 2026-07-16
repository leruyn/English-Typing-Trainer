/**
 * Prisma seed script: reads the beginner/intermediate/advanced vocabulary
 * lesson packs from `packages/shared/data/vocab/*.json`, flattens every
 * lesson pack's words, and upserts them into the `Word` table.
 *
 * Uniqueness is on `[text, cefrLevel]` (see `@@unique([text, cefrLevel])`
 * in schema.prisma — Prisma names the compound key `text_cefrLevel`), so
 * re-running this script is idempotent: existing words get their metadata
 * refreshed in place instead of being duplicated.
 *
 * Run via `npm run prisma:seed` (wired up through the `prisma.seed` entry
 * in package.json) or automatically by `prisma migrate dev`/`db seed`.
 */
import { PrismaClient } from '@prisma/client';
import type { CefrLevel } from '@art/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

interface RawVocabWord {
  word: string;
  pos: string;
  meaningVi: string;
  exampleSentence: string;
  iconHint: string;
}

interface LessonPack {
  topicId: string;
  topicNameVi: string;
  cefrLevel: CefrLevel;
  words: RawVocabWord[];
}

const VOCAB_DIR = path.resolve(__dirname, '../../packages/shared/data/vocab');
const VOCAB_FILES = ['beginner.json', 'intermediate.json', 'advanced.json'];

function loadLessonPacks(): LessonPack[] {
  return VOCAB_FILES.flatMap((fileName) => {
    const filePath = path.join(VOCAB_DIR, fileName);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as LessonPack[];
  });
}

async function main(): Promise<void> {
  const lessonPacks = loadLessonPacks();
  let upsertCount = 0;

  for (const pack of lessonPacks) {
    for (const word of pack.words) {
      await prisma.word.upsert({
        where: {
          text_cefrLevel: {
            text: word.word,
            cefrLevel: pack.cefrLevel,
          },
        },
        create: {
          text: word.word,
          cefrLevel: pack.cefrLevel,
          topicId: pack.topicId,
          topicNameVi: pack.topicNameVi,
          partOfSpeech: word.pos,
          meaningVi: word.meaningVi,
          exampleSentence: word.exampleSentence,
          iconHint: word.iconHint,
        },
        update: {
          topicId: pack.topicId,
          topicNameVi: pack.topicNameVi,
          partOfSpeech: word.pos,
          meaningVi: word.meaningVi,
          exampleSentence: word.exampleSentence,
          iconHint: word.iconHint,
        },
      });
      upsertCount += 1;
    }
  }

  console.log(`Seeded ${upsertCount} words from ${lessonPacks.length} lesson packs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
