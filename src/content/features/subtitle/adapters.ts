import type {
  SubtitleCapture,
  SubtitleCapturePattern,
  SubtitleCue,
  SubtitleNetworkFormat,
} from "../../../shared/subtitle-types";
import { parseCapturedSubtitle } from "./parsers";

export interface SubtitleCueTrack {
  adapterId: string;
  cues: SubtitleCue[];
  media?: HTMLMediaElement;
  experimental?: boolean;
}

export interface SubtitleCueSource {
  subscribe(listener: (track: SubtitleCueTrack) => void): () => void;
}

export interface SubtitleAdapterContext {
  document: Document;
  captures: SubtitleCaptureHub;
}

export interface SubtitleAdapter {
  id: string;
  experimental?: boolean;
  capturePatterns: SubtitleCapturePattern[];
  matches(url: URL): boolean;
  hook(context: SubtitleAdapterContext): SubtitleCueSource;
}

type CaptureListener = (capture: SubtitleCapture) => void;

/** Fan captured responses out to the adapter that requested each URL pattern. */
export class SubtitleCaptureHub {
  private readonly listeners = new Map<string, Set<CaptureListener>>();

  subscribe(adapterId: string, listener: CaptureListener): () => void {
    const listeners = this.listeners.get(adapterId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(adapterId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(adapterId);
    };
  }

  emit(capture: SubtitleCapture): void {
    for (const listener of this.listeners.get(capture.adapterId) ?? []) {
      listener(capture);
    }
  }
}

function hostMatches(url: URL, hosts: readonly string[]): boolean {
  return hosts.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

function largestMedia(document: Document): HTMLMediaElement | undefined {
  const video = Array.from(document.querySelectorAll("video")).sort((a, b) => {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    return bRect.width * bRect.height - aRect.width * aRect.height;
  })[0];
  return video ?? document.querySelector("audio") ?? undefined;
}

function networkAdapter(
  id: string,
  hosts: readonly string[],
  urlPattern: string,
  format: SubtitleNetworkFormat,
  options: { path?: RegExp; experimental?: boolean } = {},
): SubtitleAdapter {
  return {
    id,
    experimental: options.experimental,
    capturePatterns: [{ adapterId: id, urlPattern, format }],
    matches: (url) =>
      hostMatches(url, hosts) &&
      (!options.path || options.path.test(url.pathname)),
    hook: ({ document, captures }) => ({
      subscribe: (listener) =>
        captures.subscribe(id, (capture) => {
          const cues = parseCapturedSubtitle(capture.format, capture.body);
          if (cues.length) {
            listener({
              adapterId: id,
              cues,
              media: largestMedia(document),
              experimental: options.experimental,
            });
          }
        }),
    }),
  };
}

/** Convert browser TextTrack cues to the engine's serializable cue shape. */
export function textTrackCues(track: Pick<TextTrack, "cues">): SubtitleCue[] {
  const cues = track.cues;
  if (!cues) return [];
  const output: SubtitleCue[] = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (!cue || !("text" in cue) || typeof cue.text !== "string") continue;
    if (cue.endTime <= cue.startTime || !cue.text.trim()) continue;
    output.push({
      id: cue.id || String(index + 1),
      start: cue.startTime,
      end: cue.endTime,
      text: cue.text.trim(),
    });
  }
  return output;
}

function trackSource(document: Document): SubtitleCueSource {
  return {
    subscribe(listener) {
      const modes = new Map<TextTrack, TextTrackMode>();
      const hashes = new WeakMap<HTMLTrackElement, string>();
      const listened = new WeakSet<HTMLTrackElement>();

      const scan = (): void => {
        for (const element of document.querySelectorAll(
          "video track, audio track",
        )) {
          const trackElement = element as HTMLTrackElement;
          const kind = trackElement.kind.toLowerCase();
          if (kind !== "subtitles" && kind !== "captions") continue;
          let track: TextTrack;
          try {
            track = trackElement.track;
          } catch {
            continue;
          }
          if (!modes.has(track)) modes.set(track, track.mode);
          try {
            track.mode = "hidden";
          } catch {
            // A managed player may expose a read-only mode.
          }
          if (!listened.has(trackElement)) {
            listened.add(trackElement);
            trackElement.addEventListener("load", scan);
          }
          const cues = textTrackCues(track);
          const hash = cues
            .map((cue) => `${cue.start}|${cue.end}|${cue.text}`)
            .join("\u0000");
          if (!cues.length || hashes.get(trackElement) === hash) continue;
          hashes.set(trackElement, hash);
          listener({
            adapterId: "generic-track",
            cues,
            media:
              (trackElement.closest(
                "video, audio",
              ) as HTMLMediaElement | null) ?? undefined,
          });
        }
      };

      const observer = new MutationObserver(scan);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "kind", "default"],
      });
      const interval = window.setInterval(scan, 1_000);
      scan();
      return () => {
        observer.disconnect();
        window.clearInterval(interval);
        for (const [track, mode] of modes) {
          try {
            track.mode = mode;
          } catch {
            // A detached native track may reject writes.
          }
        }
      };
    },
  };
}

const VTT_PATTERN = "(?:\\.vtt(?:$|[?#])|subtitle|caption|texttrack)";
const TTML_PATTERN =
  "(?:\\.ttml(?:$|[?#])|\\.dfxp(?:$|[?#])|timedtext|subtitle)";

export const SUBTITLE_ADAPTERS: readonly SubtitleAdapter[] = [
  networkAdapter(
    "youtube",
    ["youtube.com", "youtubekids.com"],
    "(?:youtube\\.com|youtubekids\\.com)/api/timedtext",
    "youtube-json3",
  ),
  networkAdapter(
    "netflix",
    ["netflix.com"],
    "(?:[?&]o=|timedtext|\\.dfxp(?:$|[?#])|\\.ttml(?:$|[?#]))",
    "ttml",
  ),
  networkAdapter(
    "primevideo",
    [
      "primevideo.com",
      "amazon.com",
      "amazon.co.uk",
      "amazon.de",
      "amazon.co.jp",
    ],
    TTML_PATTERN,
    "ttml",
  ),
  networkAdapter("disneyplus", ["disneyplus.com"], VTT_PATTERN, "auto", {
    experimental: true,
  }),
  networkAdapter(
    "hbomax",
    ["max.com", "hbomax.com", "hbogoasia.com", "hbogoasia.tw"],
    VTT_PATTERN,
    "auto",
    { experimental: true },
  ),
  networkAdapter("hulu", ["hulu.com"], VTT_PATTERN, "auto", {
    experimental: true,
  }),
  networkAdapter("coursera", ["coursera.org"], VTT_PATTERN, "auto"),
  networkAdapter("udemy", ["udemy.com"], VTT_PATTERN, "auto"),
  networkAdapter("edx", ["edx.org"], VTT_PATTERN, "auto"),
  networkAdapter("khanacademy", ["khanacademy.org"], VTT_PATTERN, "auto"),
  networkAdapter("ted", ["ted.com"], VTT_PATTERN, "auto"),
  networkAdapter("vimeo", ["vimeo.com"], VTT_PATTERN, "auto"),
  networkAdapter("linkedin-learning", ["linkedin.com"], VTT_PATTERN, "auto", {
    path: /^\/learning(?:\/|$)/,
  }),
  networkAdapter(
    "bilibili",
    ["bilibili.com", "bilivideo.com", "hdslb.com"],
    "(?:api\\.bilibili\\.com/x/player/|(?:hdslb|bilivideo)\\.com/.+\\.json|subtitle_url)",
    "bilibili-json",
  ),
  networkAdapter("twitter", ["twitter.com", "x.com"], VTT_PATTERN, "auto"),
  networkAdapter("facebook", ["facebook.com", "fb.watch"], VTT_PATTERN, "auto"),
  networkAdapter("dailymotion", ["dailymotion.com"], VTT_PATTERN, "auto"),
  {
    id: "generic-track",
    capturePatterns: [],
    matches: () => true,
    hook: ({ document }) => trackSource(document),
  },
];

export function matchingSubtitleAdapters(
  value: string | URL,
): SubtitleAdapter[] {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return [];
  }
  return SUBTITLE_ADAPTERS.filter((adapter) => adapter.matches(url));
}
