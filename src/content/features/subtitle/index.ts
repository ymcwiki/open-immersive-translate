import browser from "webextension-polyfill";

import {
  DEFAULT_SUBTITLE_CONFIG,
  type SubtitleConfig,
  type SubtitleCue,
} from "../../../shared/subtitle-types";
import type { FeatureContext } from "../context";
import {
  matchingSubtitleAdapters,
  SubtitleCaptureHub,
  type SubtitleCueTrack,
} from "./adapters";
import { installCaptureBridge } from "./capture-bridge";
import { SubtitleEngine } from "./engine";
import { subtitleText } from "./i18n";
import { SubtitleRenderer } from "./renderer";

export const TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE =
  "toggleVideoSubtitlePreTranslation";

interface SubtitleSession {
  engine: SubtitleEngine;
  renderer: SubtitleRenderer;
  fingerprint: string;
  dispose(): void;
}

function resolveConfig(ctx: FeatureContext): SubtitleConfig {
  const raw = ctx.config.subtitle as FeatureContext["config"]["subtitle"] &
    Partial<SubtitleConfig>;
  return { ...DEFAULT_SUBTITLE_CONFIG, ...raw };
}

function cueFingerprint(cues: readonly SubtitleCue[]): string {
  return cues
    .map((cue) => `${cue.start}|${cue.end}|${cue.text}`)
    .join("\u0000");
}

function persistConfig(config: SubtitleConfig): void {
  void browser.runtime
    .sendMessage({ type: "setConfig", patch: { subtitle: config } })
    .catch(() => undefined);
}

/** Initialize network and TextTrack subtitle adapters for the current page. */
export function initSubtitles(ctx: FeatureContext): () => void {
  let config = resolveConfig(ctx);
  const isYouTube = /(^|\.)youtube\.com$|(^|\.)youtubekids\.com$/.test(
    window.location.hostname,
  );
  if (!config.enabled || (isYouTube && !config.youtube)) {
    return () => undefined;
  }

  const adapters = matchingSubtitleAdapters(window.location.href);
  const captureHub = new SubtitleCaptureHub();
  const sessions = new Map<HTMLMediaElement, SubtitleSession>();
  const unsubscribers: Array<() => void> = [];

  const acceptTrack = (track: SubtitleCueTrack): void => {
    const media =
      track.media ??
      document.querySelector<HTMLMediaElement>("video, audio") ??
      undefined;
    if (!media || !track.cues.length) return;
    const fingerprint = cueFingerprint(track.cues);
    const existing = sessions.get(media);
    if (existing?.fingerprint === fingerprint) return;
    existing?.dispose();

    const engine = new SubtitleEngine(ctx, {
      preTranslation: config.preTranslation,
    });
    const renderer = new SubtitleRenderer(media, config, {
      experimental: track.experimental,
      experimentalLabel: subtitleText("experimental"),
      onStyleChange: (style) => {
        config = style;
        for (const session of sessions.values()) {
          if (session.renderer !== renderer)
            session.renderer.updateStyle(style);
        }
        persistConfig(config);
      },
    });
    const unsubscribe = engine.subscribe((cues) => renderer.setCues(cues));
    const updateRollingWindow = (): void => {
      void engine.updateCurrentTime(media.currentTime).catch(() => undefined);
    };
    media.addEventListener("timeupdate", updateRollingWindow);
    media.addEventListener("seeking", updateRollingWindow);

    const session: SubtitleSession = {
      engine,
      renderer,
      fingerprint,
      dispose: () => {
        unsubscribe();
        media.removeEventListener("timeupdate", updateRollingWindow);
        media.removeEventListener("seeking", updateRollingWindow);
        renderer.dispose();
      },
    };
    sessions.set(media, session);
    void engine
      .load(track.cues)
      .then(updateRollingWindow)
      .catch(() => undefined);
  };

  for (const adapter of adapters) {
    const source = adapter.hook({ document, captures: captureHub });
    unsubscribers.push(source.subscribe(acceptTrack));
  }
  const capturePatterns = adapters.flatMap(
    (adapter) => adapter.capturePatterns,
  );
  const disposeBridge = installCaptureBridge(capturePatterns, (capture) =>
    captureHub.emit(capture),
  );

  const onMessage = (message: unknown): undefined => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE
    ) {
      return undefined;
    }
    config = { ...config, preTranslation: !config.preTranslation };
    persistConfig(config);
    for (const session of sessions.values()) {
      void session.engine
        .setPreTranslation(config.preTranslation)
        .catch(() => undefined);
    }
    return undefined;
  };
  const onControllerToggle = (): void => {
    config = { ...config, preTranslation: !config.preTranslation };
    persistConfig(config);
    for (const session of sessions.values()) {
      void session.engine
        .setPreTranslation(config.preTranslation)
        .catch(() => undefined);
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
  document.addEventListener(
    "imt:video-subtitle-pretranslation",
    onControllerToggle,
  );

  return () => {
    browser.runtime.onMessage.removeListener(onMessage);
    document.removeEventListener(
      "imt:video-subtitle-pretranslation",
      onControllerToggle,
    );
    disposeBridge();
    for (const unsubscribe of unsubscribers) unsubscribe();
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
  };
}

export const init = initSubtitles;
