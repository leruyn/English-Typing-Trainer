/**
 * Authentication routes: register a new account and log in to an existing
 * one, both returning a signed JWT for use as a `Bearer` token on
 * subsequent requests.
 *
 * `email`/`password` aren't part of the shared `@art/shared` `User` type
 * (which only models the public-facing user shape), so this module defines
 * its own local zod schemas for the request bodies instead of importing
 * `userSchema` from `@art/shared`.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';

const router = Router();

/** Cost factor for bcrypt hashing; 10 is a standard, safe default. */
const BCRYPT_SALT_ROUNDS = 10;
/** How long issued JWTs remain valid. */
const JWT_EXPIRES_IN = '30d';
/**
 * `minutesPerDay` is a required (NOT NULL) column on `User`, but is really
 * an onboarding-flow value the client may not know yet at signup time. When
 * omitted from the register payload we fall back to this default, which
 * onboarding can later overwrite via a profile-update endpoint.
 */
const DEFAULT_MINUTES_PER_DAY = 10;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  minutesPerDay: z.number().int().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

interface UserRecord {
  id: string;
  email: string;
  createdAt: Date;
  minutesPerDay: number;
  newWordCapOverride: number | null;
}

/** Strips `passwordHash` (and normalizes nullable fields) before sending a user back to the client. */
function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    minutesPerDay: user.minutesPerDay,
    newWordCapOverride: user.newWordCapOverride ?? undefined,
  };
}

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new HttpError(500, 'Server misconfiguration: JWT_SECRET is not set');
  }
  return jwt.sign({ userId }, secret, { expiresIn: JWT_EXPIRES_IN });
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}

router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, formatZodError(parsed.error));
    }
    const { email, password, minutesPerDay } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        minutesPerDay: minutesPerDay ?? DEFAULT_MINUTES_PER_DAY,
      },
    });

    const token = signToken(user.id);
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, formatZodError(parsed.error));
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Deliberately generic message: don't reveal whether the email is
      // registered at all.
      throw new HttpError(401, 'Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const token = signToken(user.id);
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
