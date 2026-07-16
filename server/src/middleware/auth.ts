/**
 * JWT authentication middleware.
 *
 * Verifies the `Authorization: Bearer <token>` header using `JWT_SECRET`
 * from the environment. On success, attaches `req.userId`. On any failure
 * (missing header, malformed token, expired/invalid signature, or a missing
 * `userId` claim) it forwards a 401 `HttpError` to the centralized error
 * handler rather than responding directly, so error formatting stays
 * consistent across the app.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/errors';

interface AccessTokenPayload {
  userId: string;
}

function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { userId?: unknown }).userId === 'string'
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new HttpError(401, 'Missing or invalid Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new HttpError(401, 'Missing bearer token'));
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new HttpError(500, 'Server misconfiguration: JWT_SECRET is not set'));
    return;
  }

  try {
    const payload = jwt.verify(token, secret);
    if (!isAccessTokenPayload(payload)) {
      next(new HttpError(401, 'Invalid token payload'));
      return;
    }
    req.userId = payload.userId;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}
