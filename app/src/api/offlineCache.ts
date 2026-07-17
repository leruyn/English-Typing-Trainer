/**
 * Generic AsyncStorage read-through cache used by the TanStack Query
 * `queryFn`s in `hooks.ts` to make GET endpoints (words/progress/stats)
 * offline-first: a successful fetch is cached under `cacheKey`, and a
 * request that fails purely because it never reached the server (see
 * `ApiError.isNetworkError`) falls back to whatever was last cached
 * instead of leaving the screen empty/erroring while offline.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "./client";

export async function fetchWithOfflineCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const result = await fetcher();
    await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.isNetworkError) {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as T;
        } catch {
          // Fall through to re-throw the original network error below.
        }
      }
    }
    throw err;
  }
}
