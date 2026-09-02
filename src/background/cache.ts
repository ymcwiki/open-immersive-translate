import type { LangCode } from "../shared/types";

/** Inputs that uniquely identify a cached paragraph translation. */
export interface TranslationCacheKey {
  serviceId: string;
  from: LangCode;
  to: LangCode;
  text: string;
}

/** Persisted translation cache value. */
export interface CachedTranslation {
  text: string;
  createdAt: number;
}

/** Look up a translation in IndexedDB. */
export async function getCachedTranslation(
  key: TranslationCacheKey,
): Promise<CachedTranslation | undefined> {
  // TODO(phase1:services): Implement the IndexedDB lookup.
  void key;
  throw new Error("NotImplemented");
}

/** Store a translation in IndexedDB. */
export async function setCachedTranslation(
  key: TranslationCacheKey,
  value: CachedTranslation,
): Promise<void> {
  // TODO(phase1:services): Implement the IndexedDB write.
  void key;
  void value;
  throw new Error("NotImplemented");
}

/** Delete entries older than the supplied retention period. */
export async function cleanupTranslationCache(
  maxAgeDays: number,
): Promise<void> {
  // TODO(phase1:services): Implement IndexedDB expiry cleanup.
  void maxAgeDays;
  throw new Error("NotImplemented");
}
