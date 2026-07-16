/**
 * A thrown error carrying an HTTP status code, used throughout the routes so
 * the centralized error-handling middleware in `index.ts` can respond with
 * the right status code and a safe, non-leaking error message.
 */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}
