/**
 * Zod schemas mirroring the domain types in `types.ts`, used to validate
 * API request/response payloads at runtime on both the server and client.
 */

import { z } from 'zod';

/** Zod schema for {@link CefrLevel}. */
export const cefrLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

/** Zod schema for {@link CefrTrack}. */
export const cefrTrackSchema = z.enum(['beginner', 'intermediate', 'advanced']);

/** Zod schema for {@link PracticeMode}. */
export const practiceModeSchema = z.enum(['visual', 'dictation', 'context']);

/** Zod schema for {@link SrsBox}. */
export const srsBoxSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/** Zod schema for {@link Word}. */
export const wordSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  cefrLevel: cefrLevelSchema,
  topicId: z.string().min(1),
  topicNameVi: z.string().min(1),
  partOfSpeech: z.string().min(1),
  meaningVi: z.string().min(1),
  exampleSentence: z.string().min(1),
  iconHint: z.string().min(1),
});

/** Zod schema for {@link UserWordProgress}. */
export const userWordProgressSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  wordId: z.string().min(1),
  srsBox: srsBoxSchema,
  timesCorrect: z.number().int().min(0),
  timesWrong: z.number().int().min(0),
  lastReviewedAt: z.coerce.date().nullable(),
  nextDueAt: z.coerce.date(),
});

/** Zod schema for {@link PracticeAttempt}. */
export const practiceAttemptSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  wordId: z.string().min(1),
  mode: practiceModeSchema,
  wpm: z.number().min(0),
  accuracyPercent: z.number().min(0).max(100),
  timeMs: z.number().min(0),
  correct: z.boolean(),
  createdAt: z.coerce.date(),
});

/**
 * Schema for the request body when submitting a new practice attempt
 * (before the server assigns an id/createdAt).
 */
export const createPracticeAttemptSchema = practiceAttemptSchema.omit({
  id: true,
  createdAt: true,
});

/** Zod schema for {@link AssessmentAnswer}. */
export const assessmentAnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(4),
  difficulty: z.number(),
  correct: z.boolean(),
});

/** Zod schema for {@link AssessmentResult}. */
export const assessmentResultSchema = z.object({
  userId: z.string().min(1),
  answers: z.array(assessmentAnswerSchema).length(5),
  suggestedTrack: cefrTrackSchema,
  createdAt: z.coerce.date(),
});

/**
 * Schema for the request body when submitting a completed assessment
 * (before the server assigns createdAt).
 */
export const createAssessmentResultSchema = assessmentResultSchema.omit({
  createdAt: true,
});

/** Zod schema for {@link User}. */
export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  createdAt: z.coerce.date(),
  minutesPerDay: z.number().int().min(1),
  newWordCapOverride: z.number().int().min(0).optional(),
});
