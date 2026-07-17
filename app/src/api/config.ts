/**
 * API configuration. The Express/Prisma backend is deployed on Render's
 * free tier (see `server/render.yaml`), which spins down after ~15 minutes
 * of inactivity — the first request after a spin-down can take 30-50s to
 * wake the instance back up, so client code that calls this API should
 * expect (and gracefully handle/retry) slow first-request latency rather
 * than treating it as a failure.
 */
export const API_BASE_URL = "https://art-server-w1qb.onrender.com";
