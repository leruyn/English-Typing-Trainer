/**
 * Mounts the background triggers that drain the offline attempt queue
 * (`attemptQueue.ts`): once on app start, whenever the app returns to the
 * foreground, and on a coarse interval while it stays open. Call this once
 * near the root of the app (see `app/app/_layout.tsx`).
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { flushAttemptQueue } from "./attemptQueue";

/** How often to retry the queue while the app is open and in the foreground. */
const FLUSH_INTERVAL_MS = 30_000;

export function useOfflineSync(): void {
  useEffect(() => {
    void flushAttemptQueue();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void flushAttemptQueue();
      }
    });

    const interval = setInterval(() => {
      void flushAttemptQueue();
    }, FLUSH_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);
}
