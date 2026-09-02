import type { AdvancedPageRule } from "../../shared/j-types";

export interface PreLine {
  leading: string;
  text: string;
  trailing: string;
  newline: string;
}

function matchesAny(element: Element, selectors: readonly string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

export function isPreLikeElement(element: Element, rule: AdvancedPageRule): boolean {
  if (
    rule.isTransformPreTagNewLine !== true &&
    rule.advanceTransformPreTagNewLine !== true
  ) {
    return false;
  }
  return matchesAny(element, rule.likePreSelectors ?? ["pre"]);
}

/** Split a pre-like block into translatable line cores and lossless whitespace. */
export function splitPreLikeText(text: string): PreLine[] {
  const lines: PreLine[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match[0] === "" && pattern.lastIndex === text.length) break;
    const raw = match[1];
    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    const end = trailing.length ? raw.length - trailing.length : raw.length;
    lines.push({
      leading,
      text: raw.slice(leading.length, end),
      trailing,
      newline: match[2],
    });
    if (!match[2]) break;
  }
  return lines;
}

export function joinPreLikeTranslation(
  lines: readonly PreLine[],
  translations: readonly string[],
): string {
  let index = 0;
  return lines
    .map((line) => {
      const translated = line.text ? (translations[index++] ?? line.text) : "";
      return `${line.leading}${translated}${line.trailing}${line.newline}`;
    })
    .join("");
}
