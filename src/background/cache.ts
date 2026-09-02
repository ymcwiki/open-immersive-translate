import type { LangCode } from "../shared/types";

const DATABASE_NAME = "bilingual-translator-cache";
const STORE_NAME = "translations";
const DATABASE_VERSION = 1;

/** Inputs that uniquely identify a cached paragraph translation. */
export interface TranslationCacheKey {
  serviceId: string;
  from: LangCode;
  to: LangCode;
  text: string;
  /** Prompt-affecting glossary/context data; omitted for legacy plain requests. */
  variant?: string;
}

/** Persisted translation cache value. */
export interface CachedTranslation {
  text: string;
  createdAt: number;
}

/** IndexedDB representation required by the translation cache design. */
export interface TranslationCacheValue {
  text: string;
  ts: number;
}

interface CacheRecord extends TranslationCacheValue {
  key: string;
}

export interface TranslationCacheOptions {
  indexedDB?: IDBFactory | null;
  databaseName?: string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

async function cacheHash(key: TranslationCacheKey): Promise<string> {
  const variant = key.variant === undefined ? "" : `|${key.variant}`;
  const value = `${key.serviceId}|${key.from}|${key.to}|${key.text}${variant}`;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** IndexedDB cache with an automatic in-memory fallback. */
export class TranslationCache {
  private databaseFactory: IDBFactory | null;
  private readonly databaseName: string;
  private databasePromise?: Promise<IDBDatabase>;
  private readonly memory = new Map<string, TranslationCacheValue>();

  constructor(options: TranslationCacheOptions = {}) {
    this.databaseFactory =
      options.indexedDB === undefined
        ? typeof globalThis.indexedDB === "undefined"
          ? null
          : globalThis.indexedDB
        : options.indexedDB;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.databaseFactory)
      return Promise.reject(new Error("IndexedDB unavailable."));
    if (this.databasePromise) return this.databasePromise;

    const databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.databaseFactory?.open(
        this.databaseName,
        DATABASE_VERSION,
      );
      if (!request) {
        reject(new Error("IndexedDB unavailable."));
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          const store = request.result.createObjectStore(STORE_NAME, {
            keyPath: "key",
          });
          store.createIndex("ts", "ts");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open translation cache."));
      request.onblocked = () =>
        reject(new Error("Translation cache upgrade was blocked."));
    }).catch((error) => {
      this.useMemory();
      throw error;
    });
    this.databasePromise = databasePromise;
    return databasePromise;
  }

  private useMemory(): void {
    this.databaseFactory = null;
    this.databasePromise = undefined;
  }

  async get(
    key: TranslationCacheKey,
  ): Promise<TranslationCacheValue | undefined> {
    const hash = await cacheHash(key);
    if (!this.databaseFactory) return this.memory.get(hash);

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const record = await requestResult(
        transaction.objectStore(STORE_NAME).get(hash) as IDBRequest<
          CacheRecord | undefined
        >,
      );
      return record ? { text: record.text, ts: record.ts } : undefined;
    } catch {
      this.useMemory();
      return this.memory.get(hash);
    }
  }

  async set(
    key: TranslationCacheKey,
    value: TranslationCacheValue,
  ): Promise<void> {
    const hash = await cacheHash(key);
    if (!this.databaseFactory) {
      this.memory.set(hash, value);
      return;
    }

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction
        .objectStore(STORE_NAME)
        .put({ key: hash, ...value } satisfies CacheRecord);
      await transactionDone(transaction);
    } catch {
      this.useMemory();
      this.memory.set(hash, value);
    }
  }

  async getMany(
    keys: readonly TranslationCacheKey[],
  ): Promise<Array<TranslationCacheValue | undefined>> {
    const hashes = await Promise.all(keys.map(cacheHash));
    if (!this.databaseFactory)
      return hashes.map((hash) => this.memory.get(hash));

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const records = await Promise.all(
        hashes.map((hash) =>
          requestResult(store.get(hash) as IDBRequest<CacheRecord | undefined>),
        ),
      );
      return records.map((record) =>
        record ? { text: record.text, ts: record.ts } : undefined,
      );
    } catch {
      this.useMemory();
      return hashes.map((hash) => this.memory.get(hash));
    }
  }

  async setMany(
    entries: readonly {
      key: TranslationCacheKey;
      value: TranslationCacheValue;
    }[],
  ): Promise<void> {
    const records = await Promise.all(
      entries.map(async ({ key, value }) => ({
        key: await cacheHash(key),
        ...value,
      })),
    );
    if (!this.databaseFactory) {
      for (const { key, text, ts } of records)
        this.memory.set(key, { text, ts });
      return;
    }

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const record of records) store.put(record satisfies CacheRecord);
      await transactionDone(transaction);
    } catch {
      this.useMemory();
      for (const { key, text, ts } of records)
        this.memory.set(key, { text, ts });
    }
  }

  async purge(maxAgeDays: number): Promise<void> {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    if (!this.databaseFactory) {
      for (const [key, value] of this.memory) {
        if (value.ts < cutoff) this.memory.delete(key);
      }
      return;
    }

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          const record = cursor.value as CacheRecord;
          if (record.ts < cutoff) cursor.delete();
          cursor.continue();
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Cache purge failed."));
      });
      await transactionDone(transaction);
    } catch {
      this.useMemory();
      for (const [key, value] of this.memory) {
        if (value.ts < cutoff) this.memory.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.memory.clear();
    if (!this.databaseFactory) return;

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      await transactionDone(transaction);
    } catch {
      this.useMemory();
    }
  }

  async count(): Promise<number> {
    if (!this.databaseFactory) return this.memory.size;

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      return await requestResult(transaction.objectStore(STORE_NAME).count());
    } catch {
      this.useMemory();
      return this.memory.size;
    }
  }
}

export const translationCache = new TranslationCache();

/** Look up a translation in IndexedDB. */
export async function getCachedTranslation(
  key: TranslationCacheKey,
): Promise<CachedTranslation | undefined> {
  const value = await translationCache.get(key);
  return value ? { text: value.text, createdAt: value.ts } : undefined;
}

/** Store a translation in IndexedDB. */
export async function setCachedTranslation(
  key: TranslationCacheKey,
  value: CachedTranslation,
): Promise<void> {
  await translationCache.set(key, { text: value.text, ts: value.createdAt });
}

/** Delete entries older than the supplied retention period. */
export async function cleanupTranslationCache(
  maxAgeDays: number,
): Promise<void> {
  await translationCache.purge(maxAgeDays);
}

export async function clearTranslationCache(): Promise<void> {
  await translationCache.clear();
}

export async function getTranslationCacheCount(): Promise<number> {
  return translationCache.count();
}
