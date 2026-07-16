/**
 * Express app entrypoint for the Active Recall English Typer API.
 */
import express from 'express';
import cors from 'cors';
import type { ErrorRequestHandler, Request, Response } from 'express';
import authRouter from './routes/auth';
import wordsRouter from './routes/words';
import progressRouter from './routes/progress';
import assessmentRouter from './routes/assessment';
import statsRouter from './routes/stats';
import { HttpError } from './lib/errors';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/words', wordsRouter);
app.use('/progress', progressRouter);
app.use('/assessment', assessmentRouter);
app.use('/stats', statsRouter);

// Unmatched routes.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

/**
 * Centralized error handler. Known `HttpError`s are surfaced to the client
 * with their intended status code and message; anything else is logged
 * server-side and reported to the client as an opaque 500 so internals
 * (stack traces, driver errors, etc.) never leak in the response body.
 */
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});

export default app;
