import type {
  Config,
  GlossaryEntry,
  LangCode,
  Paragraph,
  Rule,
  TranslationMode,
} from "./types";

export interface DomainGlossaryEntry extends GlossaryEntry {
  domain?: string;
}

export interface TranslationModePattern {
  dualMatches: string[];
  translationMatches: string[];
}

export interface AdvancedPageConfig extends Config {
  alwaysTranslateLangs: LangCode[];
  neverTranslateLangs: LangCode[];
  glossaries: DomainGlossaryEntry[];
  translationModeUrlPattern?: TranslationModePattern;
  translationModeLanguagePattern?: TranslationModePattern;
  translationThemePatterns?: Record<string, string[]>;
  translateMainOnly?: boolean;
  translateToPageEndImmediately?: boolean;
  immediateTranslationConcurrency?: number;
  translationMask?: boolean;
  enableEditTranslation?: boolean;
  hoverTranslateDirectly?: boolean;
  videoSubtitlePreTranslation?: boolean;
  mainFrameMinTextCount?: number;
  contextWordLimit?: number;
  translationFontSize?: string | number;
  translationColor?: string;
  translationLineHeight?: string | number;
  globalCustomCss?: string;
}

export interface AdvancedPageRule extends Rule {
  glossaries?: DomainGlossaryEntry[];
  additionalGlossaries?: DomainGlossaryEntry[];
  mainFrameMinTextCount?: number;
  likePreSelectors?: string[];
  isTransformPreTagNewLine?: boolean;
  advanceTransformPreTagNewLine?: boolean;
}

export const PAGE_COMMAND_IDS = [
  "toggleTranslatePage",
  "toggleTranslateTheWholePage",
  "toggleTranslateTheMainPage",
  "toggleOnlyTranslation",
  "toggleTranslateToThePageEndImmediately",
  "toggleTranslationMask",
  "toggleMouseHoverTranslateDirectly",
  "toggleVideoSubtitlePreTranslation",
  "translateWithGoogle",
  "translateWithBing",
  "translateWithDeepL",
  "translateWithOpenAI",
  "translateWithClaude",
  "translateWithGemini",
  "translateWithCustom1",
  "translateWithCustom2",
  "translateWithCustom3",
] as const;

export type PageCommandId = (typeof PAGE_COMMAND_IDS)[number];

export type PageTranslationStatus = "idle" | "translating" | "done" | "error";

export interface PageTranslationState {
  status: PageTranslationStatus;
  total: number;
  pending: number;
  translated: number;
  errors: number;
}

export interface ControllerCommandMessage {
  type: "pageControllerCommand";
  command: PageCommandId;
}

export interface PageTranslationStateMessage {
  type: "pageTranslationState";
  state: PageTranslationState;
}

export interface AdvancedParagraphMetadata {
  preformatted?: boolean;
}

export type AdvancedParagraph = Paragraph & AdvancedParagraphMetadata;

export interface ResolvedPageBehavior {
  autoTranslate: boolean;
  mode: TranslationMode;
  theme: string;
}
