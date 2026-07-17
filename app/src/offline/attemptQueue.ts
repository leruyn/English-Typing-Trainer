/**
 * Offline-first queue for practice-attempt submissions.
 *
 * The app is meant to be usable mid-commute with no signal, and the
 * backend's free-tier instance can also simply be asleep/slow to wake. So
 * every completed word's attempt is:
 *   1. Applied to local UI state immediately (optimistic - see
 *      `useSubmitAttempt` in `src/api/hooks.ts`), so typing never stalls
 *      waiting on the network.
 *   2. Sent to `POST /progress/attempt` right away.
 *   3. If step 2 fails because the request never reached the server (see
 *      `ApiError.isNetworkError` in `client.ts`), the attempt is persisted
 *      here in an AsyncStorage-backed FIFO queue instead of being dropped.
 *
 * The queue is flushed (oldest first) whenever: a new attempt is
 * successfully submitted (so a backlog drains opportunistically), the app
 * returns to the foreground, and on a coarse interval while the app is
 * open. Order is preserved and flushing stops at the first attempt that
 * still fails, so a word's SRS box transitions are never applied out of
 * order relative to earlier reviews of the same word.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { submitAttempt, type SubmitAttemptParams } from "../api/endpoints";
import { ApiError } from "../api/client";

const QUEUE_KEY = "art_offline_attempt_queue";

interface QueuedAttempt extends SubmitAttemptParams {
  /** Client-generated id, only used for de-duplication/logging. */
  queuedAt: number;
}

async function readQueue(): Promise<QueuedAttempt[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAttempt[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAttempt[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueAttempt(params: SubmitAttemptParams): Promise<void> {
  const queue = await readQueue();
  queue.push({ ...params, queuedAt: Date.now() });
  await writeQueue(queue);
}

export async function getQueueLength(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Attempts to drain the queue in FIFO order. Stops (without throwing) at
 * the first item that still fails due to a network error, leaving it and
 * everything after it in the queue for the next flush attempt. Items that
 * fail for a non-network reason (e.g. the word was since deleted, a 4xx)
 * are dropped with a console warning rather than blocking the queue
 * forever on an attempt that can never succeed.
 */
export async function flushAttemptQueue(): Promise<{ flushed: number; remaining: number }> {
  const queue = await readQueue();
  let flushed = 0;
  let i = 0;

  for (; i < queue.length; i += 1) {
    const { queuedAt, ...params } = queue[i];
    try {
      await submitAttempt(params);
      flushed += 1;
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        // Still offline (or the server is still waking up) - stop here and
        // retry the rest, in order, next time.
        break;
      }
      // A real server-side rejection: this attempt can't ever succeed as
      // written, so drop it rather than blocking the queue indefinitely.
      // eslint-disable-next-line no-console
      console.warn("Dropping un-syncable queued practice attempt:", err);
      flushed += 1;
    }
  }

  const remaining = queue.slice(i);
  if (flushed > 0) {
    await writeQueue(remaining);
  }
  return { flushed, remaining: remaining.length };
}
