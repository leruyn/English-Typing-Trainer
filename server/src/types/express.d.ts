/**
 * Augments the Express `Request` type with the `userId` field attached by
 * our JWT auth middleware (see `../middleware/auth.ts`) once a request has
 * been authenticated.
 */
import 'express';

declare global {
  namespace Express {
    interface Request {
      /** id of the authenticated user, set by `requireAuth` middleware. */
      userId?: string;
    }
  }
}

export {};
