export interface ImmediateTranslationOptions {
  concurrency?: number;
}

/** Run page-end translation tasks without viewport gating and cap in-flight work. */
export async function translateImmediately<T>(
  items: readonly T[],
  translate: (item: T) => Promise<void>,
  options: ImmediateTranslationOptions = {},
): Promise<void> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await translate(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}
