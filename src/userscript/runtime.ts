import { normalizeLang } from "../shared/lang";
import type { LangCode, TranslationMode } from "../shared/types";

const CONFIG_KEY = "imt:userscript:config";
const GOOGLE_TRANSLATE_URL =
  "https://translate.googleapis.com/translate_a/single";

export type UserscriptTheme = "underline" | "highlight" | "grey";

export interface UserscriptConfig {
  sourceLanguage: LangCode;
  targetLanguage: LangCode;
  translationMode: TranslationMode;
  theme: UserscriptTheme;
}

export const DEFAULT_USERSCRIPT_CONFIG: Readonly<UserscriptConfig> = {
  sourceLanguage: "auto",
  targetLanguage: "zh-CN",
  translationMode: "dual",
  theme: "underline",
};

interface GmResponse {
  status: number;
  response?: unknown;
  responseText?: string;
  statusText?: string;
}

interface GmRequestDetails {
  method: "GET";
  url: string;
  responseType: "json";
  timeout: number;
  onload(response: GmResponse): void;
  onerror(response: GmResponse): void;
  ontimeout(response: GmResponse): void;
  onabort(response: GmResponse): void;
}

interface GmRequestHandle {
  abort?(): void;
}

type MaybePromise<T> = T | Promise<T>;

export interface UserscriptGmApi {
  getValue<T>(key: string, fallback: T): MaybePromise<T>;
  setValue<T>(key: string, value: T): MaybePromise<void>;
  xmlHttpRequest(details: GmRequestDetails): GmRequestHandle | void;
}

export type UserscriptRuntimeMessage =
  | { type: "getConfig" }
  | { type: "setConfig"; patch: Partial<UserscriptConfig> }
  | {
      type: "translate";
      text: string;
      from: LangCode;
      to: LangCode;
      signal?: AbortSignal;
    };

export interface UserscriptRuntime {
  getConfig(): Promise<UserscriptConfig>;
  saveConfig(patch: Partial<UserscriptConfig>): Promise<UserscriptConfig>;
  translateText(
    text: string,
    from: LangCode,
    to: LangCode,
    signal?: AbortSignal,
  ): Promise<string>;
  sendMessage(
    message: UserscriptRuntimeMessage,
  ): Promise<UserscriptConfig | string>;
}

type GmGlobal = typeof globalThis & {
  GM_getValue?: <T>(key: string, fallback: T) => MaybePromise<T>;
  GM_setValue?: <T>(key: string, value: T) => MaybePromise<void>;
  GM_xmlhttpRequest?: (details: GmRequestDetails) => GmRequestHandle | void;
};

function createDefaultGmApi(): UserscriptGmApi {
  const gm = globalThis as GmGlobal;
  if (!gm.GM_getValue || !gm.GM_setValue || !gm.GM_xmlhttpRequest) {
    throw new Error(
      "This build requires GM_getValue, GM_setValue, and GM_xmlhttpRequest.",
    );
  }
  return {
    getValue: (key, fallback) => gm.GM_getValue?.(key, fallback) ?? fallback,
    setValue: (key, value) => gm.GM_setValue?.(key, value),
    xmlHttpRequest: (details) => gm.GM_xmlhttpRequest?.(details),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeConfig(value: unknown): UserscriptConfig {
  const stored = isRecord(value) ? value : {};
  const sourceLanguage = normalizeLang(
    typeof stored.sourceLanguage === "string" ? stored.sourceLanguage : "auto",
  );
  const normalizedTarget = normalizeLang(
    typeof stored.targetLanguage === "string"
      ? stored.targetLanguage
      : DEFAULT_USERSCRIPT_CONFIG.targetLanguage,
  );
  const targetLanguage =
    normalizedTarget === "auto"
      ? DEFAULT_USERSCRIPT_CONFIG.targetLanguage
      : normalizedTarget;
  const translationMode =
    stored.translationMode === "translation" ? "translation" : "dual";
  const theme = ["underline", "highlight", "grey"].includes(
    String(stored.theme),
  )
    ? (stored.theme as UserscriptTheme)
    : DEFAULT_USERSCRIPT_CONFIG.theme;

  return { sourceLanguage, targetLanguage, translationMode, theme };
}

function abortError(): Error {
  return new DOMException("Translation aborted.", "AbortError");
}

function parseGoogleTranslation(value: unknown): string {
  if (!Array.isArray(value) || !Array.isArray(value[0])) {
    throw new Error("Google Translate returned an invalid response.");
  }

  const text = value[0]
    .map((segment: unknown) =>
      Array.isArray(segment) && typeof segment[0] === "string"
        ? segment[0]
        : "",
    )
    .join("");
  if (!text) throw new Error("Google Translate returned an empty response.");
  return text;
}

function responseJson(response: GmResponse): unknown {
  if (response.response !== undefined) return response.response;
  if (!response.responseText) return undefined;
  return JSON.parse(response.responseText) as unknown;
}

/** GM-backed replacement for extension runtime messaging and local storage. */
export class GmUserscriptRuntime implements UserscriptRuntime {
  private readonly gm: UserscriptGmApi;

  constructor(gm: UserscriptGmApi = createDefaultGmApi()) {
    this.gm = gm;
  }

  async getConfig(): Promise<UserscriptConfig> {
    const stored = await this.gm.getValue<unknown>(CONFIG_KEY, undefined);
    return normalizeConfig(stored);
  }

  async saveConfig(
    patch: Partial<UserscriptConfig>,
  ): Promise<UserscriptConfig> {
    const next = normalizeConfig({ ...(await this.getConfig()), ...patch });
    await this.gm.setValue(CONFIG_KEY, next);
    return next;
  }

  translateText(
    text: string,
    from: LangCode,
    to: LangCode,
    signal?: AbortSignal,
  ): Promise<string> {
    if (signal?.aborted) return Promise.reject(abortError());

    const query = new URLSearchParams({
      client: "gtx",
      sl: from,
      tl: to,
      dt: "t",
      q: text,
    });

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let handle: GmRequestHandle | void;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        callback();
      };
      const fail = (message: string): void =>
        finish(() => reject(new Error(message)));
      const onAbort = (): void => {
        handle?.abort?.();
        finish(() => reject(abortError()));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        handle = this.gm.xmlHttpRequest({
          method: "GET",
          url: `${GOOGLE_TRANSLATE_URL}?${query.toString()}`,
          responseType: "json",
          timeout: 30_000,
          onload: (response) => {
            if (response.status < 200 || response.status >= 300) {
              fail(
                `Google Translate failed with HTTP ${response.status}${
                  response.statusText ? ` ${response.statusText}` : ""
                }.`,
              );
              return;
            }
            try {
              const translation = parseGoogleTranslation(
                responseJson(response),
              );
              finish(() => resolve(translation));
            } catch (error) {
              fail(
                error instanceof Error ? error.message : "Invalid response.",
              );
            }
          },
          onerror: () => fail("Google Translate network request failed."),
          ontimeout: () => fail("Google Translate request timed out."),
          onabort: () => finish(() => reject(abortError())),
        });
      } catch (error) {
        fail(
          error instanceof Error
            ? error.message
            : "Translation request failed.",
        );
      }
    });
  }

  async sendMessage(
    message: UserscriptRuntimeMessage,
  ): Promise<UserscriptConfig | string> {
    if (message.type === "getConfig") return this.getConfig();
    if (message.type === "setConfig") return this.saveConfig(message.patch);
    return this.translateText(
      message.text,
      message.from,
      message.to,
      message.signal,
    );
  }
}
