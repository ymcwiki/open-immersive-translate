import { normalizeLang } from "../../shared/lang";
import type {
  AdvancedPageConfig,
  AdvancedPageRule,
  DomainGlossaryEntry,
  TranslationModePattern,
} from "../../shared/j-types";
import type { LangCode, TranslationMode } from "../../shared/types";

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

export function globMatches(value: string, glob: string): boolean {
  if (glob === "<all_urls>") return /^(?:https?|file|ftp):/i.test(value);
  const source = glob.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}$`, "i").test(value);
}

function matchedMode(
  value: string,
  pattern: TranslationModePattern | undefined,
  match: (value: string, pattern: string) => boolean,
): TranslationMode | undefined {
  if (pattern?.translationMatches.some((item) => match(value, item))) {
    return "translation";
  }
  if (pattern?.dualMatches.some((item) => match(value, item))) return "dual";
  return undefined;
}

export function resolveTranslationMode(
  config: AdvancedPageConfig,
  rule: AdvancedPageRule,
  url: string,
  pageLanguage: LangCode,
): TranslationMode {
  return (
    matchedMode(url, config.translationModeUrlPattern, globMatches) ??
    matchedMode(
      pageLanguage,
      config.translationModeLanguagePattern,
      (language, pattern) => normalizeLang(pattern) === language,
    ) ??
    rule.translationMode ??
    config.translationMode
  );
}

export function resolveTranslationTheme(
  config: AdvancedPageConfig,
  rule: AdvancedPageRule,
  url: string,
): string {
  for (const [theme, globs] of Object.entries(config.translationThemePatterns ?? {})) {
    if (globs.some((glob) => globMatches(url, glob))) return theme;
  }
  return rule.theme ?? config.theme;
}

function siteMatches(hostname: string, site: string): boolean {
  const normalized = site.trim().replace(/^\*\./, "").toLocaleLowerCase();
  const host = hostname.toLocaleLowerCase();
  return host === normalized || host.endsWith(`.${normalized}`);
}

export function shouldAutoTranslatePage(
  config: AdvancedPageConfig,
  rule: AdvancedPageRule,
  hostname: string,
  pageLanguage: LangCode,
): boolean {
  if (config.neverTranslateSites.some((site) => siteMatches(hostname, site))) {
    return false;
  }
  if (
    pageLanguage !== "auto" &&
    config.neverTranslateLangs.some(
      (language) => normalizeLang(language) === pageLanguage,
    )
  ) {
    return false;
  }
  return (
    config.alwaysTranslateSites.some((site) => siteMatches(hostname, site)) ||
    (pageLanguage !== "auto" &&
      config.alwaysTranslateLangs.some(
        (language) => normalizeLang(language) === pageLanguage,
      )) ||
    rule.autoTranslate === true
  );
}

export function glossaryForDomain(
  entries: readonly DomainGlossaryEntry[],
  hostname: string,
): DomainGlossaryEntry[] {
  return entries
    .filter(({ domain }) => {
      if (!domain?.trim()) return true;
      return domain
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .some((part) =>
          part.includes("*")
            ? globMatches(hostname, part)
            : siteMatches(hostname, part),
        );
    })
    .map(({ k, v, domain }) => ({ k, v, ...(domain ? { domain } : {}) }));
}
