import type {
  BilingualSubtitleCue,
  SubtitleConfig,
} from "../../../shared/subtitle-types";

interface NativeTrackState {
  track: TextTrack;
  mode: TextTrackMode;
}

export interface SubtitleRendererOptions {
  experimental?: boolean;
  experimentalLabel?: string;
  onStyleChange?(style: SubtitleConfig): void;
}

/** Convert a six-digit CSS hex color and opacity to rgba. */
export function hexToRgba(hex: string, opacity: number): string {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return `rgba(8, 8, 8, ${Math.min(1, Math.max(0, opacity))})`;
  return `rgba(${Number.parseInt(match[1], 16)}, ${Number.parseInt(match[2], 16)}, ${Number.parseInt(match[3], 16)}, ${Math.min(1, Math.max(0, opacity))})`;
}

/** Shadow-DOM subtitle overlay anchored to one video or audio timeline. */
export class SubtitleRenderer {
  readonly host: HTMLElement;

  private readonly root: ShadowRoot;
  private readonly box: HTMLElement;
  private readonly sourceLine: HTMLElement;
  private readonly translationLine: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly nativeTracks: NativeTrackState[] = [];
  private readonly resizeObserver?: ResizeObserver;
  private cues: readonly BilingualSubtitleCue[] = [];
  private style: SubtitleConfig;
  private frame?: number;
  private drag?: {
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  };

  constructor(
    private readonly media: HTMLMediaElement,
    style: SubtitleConfig,
    private readonly options: SubtitleRendererOptions = {},
  ) {
    this.style = { ...style };
    this.host = document.createElement("div");
    this.host.dataset.imt = "subtitle-overlay";
    this.host.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;overflow:hidden;";
    this.root = this.host.attachShadow({ mode: "open" });

    const sheet = document.createElement("style");
    sheet.textContent = `
      :host { all: initial; }
      .frame { position: absolute; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; }
      .caption { position: absolute; left: 50%; transform: translateX(-50%); width: max-content; max-width: 92%; box-sizing: border-box; border-radius: 6px; padding: .24em .55em; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.35; text-shadow: 0 1px 2px #000; pointer-events: auto; cursor: move; user-select: none; }
      .caption[hidden] { display: none; }
      .source, .translation { display: block; }
      .badge { position: absolute; right: 6px; top: -20px; border-radius: 3px; padding: 1px 4px; background: #b45309; color: white; font: 10px/1.4 system-ui, sans-serif; }
      .badge[hidden] { display: none; }
    `;
    const frame = document.createElement("div");
    frame.className = "frame";
    this.box = document.createElement("div");
    this.box.className = "caption";
    this.box.hidden = true;
    this.badge = document.createElement("span");
    this.badge.className = "badge";
    this.badge.hidden = !options.experimental;
    this.badge.textContent = options.experimentalLabel ?? "Experimental";
    this.sourceLine = document.createElement("span");
    this.sourceLine.className = "source";
    this.translationLine = document.createElement("span");
    this.translationLine.className = "translation";
    this.box.append(this.badge, this.sourceLine, this.translationLine);
    frame.append(this.box);
    this.root.append(sheet, frame);
    document.documentElement.append(this.host);

    this.hideNativeTracks();
    this.applyStyle();
    this.updatePlacement();
    this.media.addEventListener("timeupdate", this.onTimeUpdate);
    this.media.addEventListener("seeking", this.onTimeUpdate);
    this.media.addEventListener("play", this.onPlay);
    this.media.addEventListener("pause", this.onPause);
    window.addEventListener("resize", this.onPlacementChange);
    window.addEventListener("scroll", this.onPlacementChange, true);
    document.addEventListener("fullscreenchange", this.onPlacementChange);
    this.box.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.updatePlacement());
      this.resizeObserver.observe(media);
    }
  }

  setCues(cues: readonly BilingualSubtitleCue[]): void {
    this.cues = cues;
    this.renderAt(this.media.currentTime);
  }

  updateStyle(patch: Partial<SubtitleConfig>): void {
    this.style = { ...this.style, ...patch };
    this.applyStyle();
    this.renderAt(this.media.currentTime);
  }

  renderAt(currentTime: number): void {
    const cue = this.cues.find(
      (item) => item.start <= currentTime && currentTime < item.end,
    );
    this.box.hidden = !cue;
    if (!cue) return;

    this.sourceLine.textContent = cue.text;
    this.translationLine.textContent = cue.translation ?? "";
    this.sourceLine.hidden = this.style.mode === "translation-only";
    this.translationLine.hidden =
      this.style.mode === "source-only" || cue.translation === undefined;
  }

  dispose(): void {
    this.stopFrame();
    this.resizeObserver?.disconnect();
    this.media.removeEventListener("timeupdate", this.onTimeUpdate);
    this.media.removeEventListener("seeking", this.onTimeUpdate);
    this.media.removeEventListener("play", this.onPlay);
    this.media.removeEventListener("pause", this.onPause);
    window.removeEventListener("resize", this.onPlacementChange);
    window.removeEventListener("scroll", this.onPlacementChange, true);
    document.removeEventListener("fullscreenchange", this.onPlacementChange);
    this.box.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    for (const { track, mode } of this.nativeTracks) {
      try {
        track.mode = mode;
      } catch {
        // A detached native track may reject writes.
      }
    }
    this.host.remove();
  }

  private readonly onTimeUpdate = (): void => {
    this.renderAt(this.media.currentTime);
  };

  private readonly onPlay = (): void => {
    const tick = (): void => {
      this.renderAt(this.media.currentTime);
      if (!this.media.paused) this.frame = requestAnimationFrame(tick);
    };
    this.stopFrame();
    tick();
  };

  private readonly onPause = (): void => this.stopFrame();

  private readonly onPlacementChange = (): void => this.updatePlacement();

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.drag = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: this.style.offsetX,
      offsetY: this.style.offsetY,
    };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.drag) return;
    this.style.offsetX = this.drag.offsetX + event.clientX - this.drag.startX;
    this.style.offsetY = this.drag.offsetY + event.clientY - this.drag.startY;
    this.applyStyle();
  };

  private readonly onPointerUp = (): void => {
    if (!this.drag) return;
    this.drag = undefined;
    this.options.onStyleChange?.({ ...this.style });
  };

  private stopFrame(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private hideNativeTracks(): void {
    for (let index = 0; index < this.media.textTracks.length; index += 1) {
      const track = this.media.textTracks[index];
      if (!track) continue;
      this.nativeTracks.push({ track, mode: track.mode });
      try {
        track.mode = "hidden";
      } catch {
        // Some managed players expose a read-only TextTrack.
      }
    }
  }

  private applyStyle(): void {
    this.box.style.fontSize = `${Math.max(10, this.style.fontSize)}px`;
    this.box.style.backgroundColor = hexToRgba(
      this.style.backgroundColor,
      this.style.backgroundOpacity,
    );
    this.sourceLine.style.color = this.style.sourceColor;
    this.translationLine.style.color = this.style.translationColor;
    this.box.style.left = `calc(50% + ${this.style.offsetX}px)`;
    this.box.style.transform = `translate(-50%, ${this.style.offsetY}px)`;
    this.box.style.top = "";
    this.box.style.bottom = "";
    if (this.style.position === "top") this.box.style.top = "8%";
    else if (this.style.position === "center") this.box.style.top = "46%";
    else this.box.style.bottom = "8%";
  }

  private updatePlacement(): void {
    const fullscreen = document.fullscreenElement;
    const container =
      fullscreen && fullscreen !== this.media && fullscreen.contains(this.media)
        ? fullscreen
        : document.documentElement;
    if (this.host.parentElement !== container) container.append(this.host);
    const rect = this.media.getBoundingClientRect();
    const audioOnly = this.media instanceof HTMLAudioElement;
    this.host.style.left = `${audioOnly ? 0 : rect.left}px`;
    this.host.style.top = `${audioOnly ? 0 : rect.top}px`;
    this.host.style.width = `${audioOnly ? window.innerWidth : rect.width}px`;
    this.host.style.height = `${audioOnly ? window.innerHeight : rect.height}px`;
  }
}
