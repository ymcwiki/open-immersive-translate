import type {
  BilingualSubtitleCue,
  SubtitleCue,
} from "../../../shared/subtitle-types";
import type { FeatureContext } from "../context";

export const MAX_CUES_PER_BATCH = 50;
export const MAX_CHARS_PER_BATCH = 4_000;
export const DEFAULT_ROLLING_WINDOW_SECONDS = 60;

const SENTENCE_END = /[.!?。！？…][\]})"'”’]*$/;

function validCue(cue: SubtitleCue): boolean {
  return (
    Number.isFinite(cue.start) &&
    Number.isFinite(cue.end) &&
    cue.end > cue.start &&
    cue.text.trim().length > 0
  );
}

function splitLongCue(cue: SubtitleCue, maxChars: number): SubtitleCue[] {
  const text = cue.text.trim();
  if (text.length <= maxChars) return [{ ...cue, text }];
  const pieces: SubtitleCue[] = [];
  const count = Math.ceil(text.length / maxChars);
  const duration = cue.end - cue.start;
  for (let start = 0; start < text.length; start += maxChars) {
    const index = pieces.length;
    pieces.push({
      ...cue,
      id: undefined,
      start: cue.start + (duration * index) / count,
      end: cue.start + (duration * (index + 1)) / count,
      text: text.slice(start, start + maxChars),
    });
  }
  return pieces;
}

/** Join short source cues into sentence-level translation batches. */
export function batchCueSentences(
  input: readonly SubtitleCue[],
  maxCues = MAX_CUES_PER_BATCH,
  maxChars = MAX_CHARS_PER_BATCH,
): SubtitleCue[] {
  const cues = input
    .filter(validCue)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .flatMap((cue) => splitLongCue(cue, maxChars));
  const batches: SubtitleCue[] = [];
  let current: SubtitleCue[] = [];
  let chars = 0;

  const flush = (): void => {
    if (!current.length) return;
    batches.push({
      id: current.length === 1 ? current[0].id : undefined,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((cue) => cue.text.trim()).join(" "),
    });
    current = [];
    chars = 0;
  };

  for (const cue of cues) {
    const nextChars = chars + (current.length ? 1 : 0) + cue.text.length;
    if (current.length && (current.length >= maxCues || nextChars > maxChars)) {
      flush();
    }
    current.push(cue);
    chars += (current.length > 1 ? 1 : 0) + cue.text.length;
    if (SENTENCE_END.test(cue.text.trim())) flush();
  }
  flush();
  return batches;
}

export interface SubtitleEngineOptions {
  preTranslation?: boolean;
  rollingWindowSeconds?: number;
  cache?: Map<string, string>;
}

/** Translate and cache a timed cue stream for live rendering. */
export class SubtitleEngine {
  private readonly cache: Map<string, string>;
  private readonly inFlight = new Map<string, Promise<string>>();
  private readonly listeners = new Set<
    (cues: readonly BilingualSubtitleCue[]) => void
  >();
  private cues: BilingualSubtitleCue[] = [];
  private generation = 0;
  private preTranslation: boolean;
  private readonly rollingWindowSeconds: number;

  constructor(
    private readonly ctx: Pick<FeatureContext, "config" | "translateText">,
    options: SubtitleEngineOptions = {},
  ) {
    this.preTranslation = options.preTranslation ?? true;
    this.rollingWindowSeconds =
      options.rollingWindowSeconds ?? DEFAULT_ROLLING_WINDOW_SECONDS;
    this.cache = options.cache ?? new Map();
  }

  get bilingualCues(): readonly BilingualSubtitleCue[] {
    return this.cues.map((cue) => ({ ...cue }));
  }

  get isPreTranslationEnabled(): boolean {
    return this.preTranslation;
  }

  subscribe(
    listener: (cues: readonly BilingualSubtitleCue[]) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.bilingualCues);
    return () => this.listeners.delete(listener);
  }

  async load(input: readonly SubtitleCue[]): Promise<void> {
    const generation = ++this.generation;
    this.cues = batchCueSentences(input).map((cue, index) => ({
      ...cue,
      id: cue.id ?? `subtitle-${index + 1}`,
    }));
    this.emit();
    if (this.preTranslation) {
      await this.translateIndices(
        this.cues.map((_, index) => index),
        generation,
      );
    }
  }

  async setPreTranslation(enabled: boolean): Promise<void> {
    this.preTranslation = enabled;
    if (enabled) {
      await this.translateIndices(
        this.cues.map((_, index) => index),
        this.generation,
      );
    }
  }

  async updateCurrentTime(currentTime: number): Promise<void> {
    if (this.preTranslation) return;
    const windowEnd = currentTime + this.rollingWindowSeconds;
    const indices = this.cues.flatMap((cue, index) =>
      cue.end >= currentTime && cue.start <= windowEnd ? [index] : [],
    );
    await this.translateIndices(indices, this.generation);
  }

  activeCue(currentTime: number): BilingualSubtitleCue | undefined {
    const cue = this.cues.find(
      (item) => item.start <= currentTime && currentTime < item.end,
    );
    return cue ? { ...cue } : undefined;
  }

  private async translateIndices(
    indices: readonly number[],
    generation: number,
  ): Promise<void> {
    let batch: number[] = [];
    let chars = 0;
    const batches: number[][] = [];
    for (const index of indices) {
      const cue = this.cues[index];
      if (!cue || cue.translation !== undefined) continue;
      if (
        batch.length &&
        (batch.length >= MAX_CUES_PER_BATCH ||
          chars + cue.text.length > MAX_CHARS_PER_BATCH)
      ) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(index);
      chars += cue.text.length;
    }
    if (batch.length) batches.push(batch);

    for (const item of batches) {
      await Promise.all(
        item.map(async (index) => {
          const cue = this.cues[index];
          if (!cue) return;
          try {
            const translation = await this.translate(cue.text);
            if (generation === this.generation && this.cues[index] === cue) {
              cue.translation = translation;
            }
          } catch {
            // A failed cue remains untranslated and can be retried on the next window update.
          }
        }),
      );
      if (generation !== this.generation) return;
      this.emit();
    }
  }

  private translate(text: string): Promise<string> {
    const from = this.ctx.config.sourceLanguage;
    const to = this.ctx.config.targetLanguage;
    const key = `${from}\u0000${to}\u0000${text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.ctx
      .translateText(text, from, to)
      .then((translation) => {
        this.cache.set(key, translation);
        return translation;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private emit(): void {
    const snapshot = this.bilingualCues;
    for (const listener of this.listeners) listener(snapshot);
  }
}
