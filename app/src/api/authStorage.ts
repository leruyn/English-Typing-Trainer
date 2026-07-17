/**
 * Persistence helpers for the auth session.
 *
 * The JWT lives in `expo-secure-store` (encrypted keychain/keystore storage)
 * since it's a bearer credential; the lightweight public user profile is
 * cached in plain AsyncStorage (not sensitive, and reading it must be fast
 * and synchronous-ish at app boot to decide which route to land on).
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WireUser } from "./endpoints";

const TOKEN_KEY = "art_auth_token";
const USER_CACHE_KEY = "art_cached_user";

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getCachedUser(): Promise<WireUser | null> {
  const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WireUser;
  } catch {
    return null;
  }
}

export async function setCachedUser(user: WireUser): Promise<void> {
  await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
}

export async function clearCachedUser(): Promise<void> {
  await AsyncStorage.removeItem(USER_CACHE_KEY);
}
