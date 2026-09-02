import type { GlossaryEntry, TranslateRequest } from "../../shared/types";
import type { PromptVariant } from "./service-config";

export interface PromptTemplateSet {
  system: string;
  user: string;
}

export const DEFAULT_PROMPTS: Readonly<
  Record<PromptVariant, PromptTemplateSet>
> = {
  default: {
    system: `Translate from {{from}} into natural {{to}}.
Return only a YAML list with the same ids and item count as the input. Keep HTML tags in sensible positions, preserve paragraph boundaries, and leave names, code, placeholders, and untranslatable text unchanged.
Page title: {{title}}
Page summary: {{summary}}
Required terminology:
{{glossary}}`,
    user: `Translate these items. Return only YAML using "- id: N" and "  text: ..." entries.
{{text}}`,
  },
  subtitle: {
    system: `Translate subtitles from {{from}} into concise, spoken {{to}}.
Return only a YAML list with the same ids and order. Keep timing-related line breaks, names, code, and placeholders unchanged. Use the surrounding summary to resolve pronouns and terminology.
Video title: {{title}}
Video summary: {{summary}}
Required terminology:
{{glossary}}`,
    user: `Translate this subtitle batch and return only aligned YAML.
{{text}}`,
  },
  selection: {
    system: `Translate the selected text from {{from}} into {{to}}.
For a word, give a short dictionary-style meaning suited to the page context. For a phrase or sentence, return only the translation. Preserve HTML, code, names, and placeholders.
Page title: {{title}}
Context: {{summary}}
Required terminology:
{{glossary}}`,
    user: `Translate this selection and return only aligned YAML.
{{text}}`,
  },
};

function glossaryText(glossary: readonly GlossaryEntry[] | undefined): string {
  if (!glossary?.length) return "(none)";
  return glossary.map(({ k, v }) => `${k}: ${v}`).join("\n");
}

export function renderPromptTemplate(
  template: string,
  request: TranslateRequest,
  text: string,
): string {
  const variables: Record<string, string> = {
    from: request.from,
    to: request.to,
    title: request.context?.title ?? "",
    summary: request.context?.summary ?? "",
    glossary: glossaryText(request.glossary),
    text,
  };
  return template.replace(
    /{{(from|to|title|summary|glossary|text)}}/g,
    (_, key: string) => variables[key] ?? "",
  );
}

export function requestPromptVariant(request: TranslateRequest): PromptVariant {
  const variant = (request as TranslateRequest & { variant?: unknown }).variant;
  return variant === "subtitle" || variant === "selection"
    ? variant
    : "default";
}
