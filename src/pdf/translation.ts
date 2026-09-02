import {
  connectTranslatePort,
  type ContentTranslatePort,
  type ParagraphTranslationResult,
  type TranslatePortMessage,
  type TranslateResultMessage,
} from "../shared/messages";
import type {
  GlossaryEntry,
  LangCode,
  TranslateParagraph,
  TranslationContext,
} from "../shared/types";

const RECONNECT_DELAY_MS = 250;

interface PdfTranslationRequest {
  paragraphs: TranslateParagraph[];
  from: LangCode;
  to: LangCode;
  service?: string;
  glossary?: GlossaryEntry[];
  context?: TranslationContext;
}

interface PendingRequest {
  message: TranslatePortMessage;
  remaining: Set<string>;
}

type ResultHandler = (
  results: ParagraphTranslationResult[],
  done: boolean,
) => void;

/** Streaming translation client used by the extension PDF reader tab. */
export class PdfTranslationClient {
  private port?: ContentTranslatePort;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private disposed = false;
  private readonly requests = new Map<string, PendingRequest>();

  constructor(private readonly onResult: ResultHandler) {
    this.connect();
  }

  translate(request: PdfTranslationRequest): string | undefined {
    if (!request.paragraphs.length || this.disposed) return undefined;
    const requestId = `pdf-${Date.now().toString(36)}-${++this.sequence}`;
    const message: TranslatePortMessage = {
      type: "translate",
      requestId,
      paragraphs: request.paragraphs,
      from: request.from,
      to: request.to,
      service: request.service,
      glossary: request.glossary,
      context: request.context,
      priority: "viewport",
    };
    this.requests.set(requestId, {
      message,
      remaining: new Set(request.paragraphs.map(({ id }) => id)),
    });
    this.post(message);
    return requestId;
  }

  cancelAll(): void {
    for (const requestId of this.requests.keys()) {
      this.post({ type: "cancel", requestId });
    }
    this.requests.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAll();
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.port?.disconnect();
    this.port = undefined;
  }

  private connect(): void {
    if (this.disposed || this.port) return;
    try {
      const port = connectTranslatePort();
      this.port = port;
      port.onMessage((message) => this.handleMessage(message));
      port.onDisconnect(() => {
        if (this.port !== port) return;
        this.port = undefined;
        this.scheduleReconnect();
      });
      for (const request of this.requests.values()) {
        const paragraphs = request.message.paragraphs.filter(({ id }) =>
          request.remaining.has(id),
        );
        if (paragraphs.length) {
          port.postMessage({ ...request.message, paragraphs });
        }
      }
    } catch {
      this.port = undefined;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private post(
    message: Parameters<ContentTranslatePort["postMessage"]>[0],
  ): void {
    if (!this.port) {
      this.connect();
      return;
    }
    try {
      this.port.postMessage(message);
    } catch {
      this.port = undefined;
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: TranslateResultMessage): void {
    const request = this.requests.get(message.requestId);
    if (!request) return;
    for (const result of message.results) request.remaining.delete(result.id);
    this.onResult(message.results, message.done);
    if (message.done || !request.remaining.size) {
      this.requests.delete(message.requestId);
    }
  }
}
