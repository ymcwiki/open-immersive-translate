import type {
  PageCommandId,
  PageTranslationState,
} from "../../shared/j-types";

const CHANNEL = "imt:page-controller";

interface FrameCommandEnvelope {
  channel: typeof CHANNEL;
  kind: "command";
  command: PageCommandId;
}

interface FrameStateEnvelope {
  channel: typeof CHANNEL;
  kind: "state";
  frameId: string;
  state: PageTranslationState;
}

type FrameEnvelope = FrameCommandEnvelope | FrameStateEnvelope;

export interface FrameSync {
  readonly isTop: boolean;
  broadcast(command: PageCommandId): void;
  report(state: PageTranslationState): void;
  dispose(): void;
}

function isEnvelope(value: unknown): value is FrameEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "channel" in value &&
    value.channel === CHANNEL &&
    "kind" in value
  );
}

export function frameHasEnoughText(doc: Document, minimum = 50): boolean {
  const length = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim().length;
  return length >= Math.max(0, minimum);
}

export function createFrameSync(
  win: Window,
  onCommand: (command: PageCommandId) => void,
  onFrameState?: (frameId: string, state: PageTranslationState) => void,
): FrameSync {
  const isTop = win.top === win;
  const frameId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const listener = (event: MessageEvent<unknown>): void => {
    if (!isEnvelope(event.data)) return;
    if (!isTop && event.data.kind === "command" && event.source === win.top) {
      onCommand(event.data.command);
    } else if (isTop && event.data.kind === "state") {
      onFrameState?.(event.data.frameId, event.data.state);
    }
  };
  win.addEventListener("message", listener);

  return {
    isTop,
    broadcast(command) {
      if (!isTop) return;
      const message: FrameCommandEnvelope = { channel: CHANNEL, kind: "command", command };
      for (const frame of win.document.querySelectorAll("iframe")) {
        frame.contentWindow?.postMessage(message, "*");
      }
    },
    report(state) {
      if (isTop) return;
      const message: FrameStateEnvelope = { channel: CHANNEL, kind: "state", frameId, state };
      win.top?.postMessage(message, "*");
    },
    dispose() {
      win.removeEventListener("message", listener);
    },
  };
}
