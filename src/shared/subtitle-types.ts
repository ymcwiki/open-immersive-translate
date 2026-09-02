/** One timed subtitle cue, measured in seconds. */
export interface SubtitleCue {
  id?: string;
  start: number;
  end: number;
  text: string;
  settings?: string;
}

/** A cue after translation. Translation is absent while work is pending. */
export interface BilingualSubtitleCue extends SubtitleCue {
  translation?: string;
}

export type SubtitleDisplayMode = "dual" | "translation-only" | "source-only";
export type SubtitlePosition = "top" | "center" | "bottom";

/** Persisted subtitle settings requested by workstream H. */
export interface SubtitleConfig {
  enabled: boolean;
  youtube: boolean;
  preTranslation: boolean;
  fontSize: number;
  sourceColor: string;
  translationColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: SubtitlePosition;
  mode: SubtitleDisplayMode;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  enabled: true,
  youtube: true,
  preTranslation: true,
  fontSize: 24,
  sourceColor: "#ffffff",
  translationColor: "#ffffff",
  backgroundColor: "#080808",
  backgroundOpacity: 0.75,
  position: "bottom",
  mode: "dual",
  offsetX: 0,
  offsetY: 0,
};

export type SubtitleNetworkFormat =
  "auto" | "webvtt" | "ttml" | "youtube-json3" | "bilibili-json";

/** Serializable matcher sent to the MAIN-world request interceptor. */
export interface SubtitleCapturePattern {
  adapterId: string;
  urlPattern: string;
  format: SubtitleNetworkFormat;
}

/** A subtitle response copied from the page world without changing it. */
export interface SubtitleCapture {
  adapterId: string;
  format: SubtitleNetworkFormat;
  url: string;
  body: string;
}
