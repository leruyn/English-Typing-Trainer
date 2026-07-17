/**
 * Thin client for Google's Gemini `generateContent` REST API, shared by
 * every AI-backed route (`/stats/coaching`, `/assessment/question`,
 * `/ai/explain`).
 *
 * Uses Node's built-in global `fetch` (Node 18+, which is what this server
 * already assumes elsewhere) rather than adding an HTTP client dependency.
 *
 * Auth is via `?key=` query param per Gemini's REST API (no request-header
 * scheme) - the key never appears in logs since we never log the built
 * URL, only the response status/parsed text.
 */
import { HttpError } from './errors';

// Matches the model the user confirmed working against their own API key
// (`modelVersion: "gemini-3.5-flash"` in a live response) - overridable via
// `GEMINI_MODEL` if that changes later.
const DEFAULT_MODEL = 'gemini-3.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends HttpError {
  constructor(message: string) {
    // Surfaced to the client as a 503: the AI feature is unavailable right
    // now, but this is never the *user's* fault (bad input would be a 400
    // from our own validation before we ever call Gemini), so 503 fits
    // better than 500 - a caller could reasonably retry.
    super(503, message);
    this.name = 'GeminiError';
  }
}

interface GenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError('Server misconfiguration: GEMINI_API_KEY is not set');
  }
  return key;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Sends a single-turn prompt to Gemini and returns the model's raw text
 * response. Throws `GeminiError` (a 503 `HttpError`) on any failure -
 * network error, non-2xx response, safety block, or an empty/missing
 * candidate - so callers can let it propagate straight to Express's
 * centralized error handler without their own try/catch boilerplate.
 */
export async function generateGeminiText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const { temperature = 0.7, maxOutputTokens = 1024 } = options;
  const model = getModel();
  const url = `${API_BASE}/${model}:generateContent?key=${getApiKey()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    throw new GeminiError(`Failed to reach Gemini API: ${message}`);
  }

  if (!response.ok) {
    // Don't forward Gemini's raw error body to the client (may contain
    // request details) - log it server-side only.
    const bodyText = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error(`Gemini API error ${response.status}:`, bodyText);
    throw new GeminiError(`Gemini API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) {
    throw new GeminiError('Gemini returned an empty response');
  }

  return text.trim();
}

/**
 * Same as `generateGeminiText`, but instructs the model to return strict
 * JSON and parses it into `T`. Gemini sometimes wraps JSON in a ```json
 * fenced code block despite instructions not to - stripped before parsing.
 * Throws `GeminiError` if the response isn't valid JSON, so callers that
 * need a hard structural guarantee (e.g. assessment questions) can catch
 * this specifically and fall back to a static alternative.
 */
export async function generateGeminiJson<T>(prompt: string, options: GenerateOptions = {}): Promise<T> {
  const text = await generateGeminiText(
    `${prompt}\n\nRespond with ONLY raw JSON - no markdown code fences, no commentary before or after.`,
    options,
  );

  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    throw new GeminiError('Gemini returned invalid JSON');
  }
}
