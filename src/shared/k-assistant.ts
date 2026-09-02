import type { LangCode } from "./types";

export const ASSISTANT_PORT_NAME = "imt:assistant";

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRequest {
  kind: "translate" | "chat" | "writing" | "dictionary";
  text: string;
  service: string;
  from?: LangCode;
  to?: LangCode;
  instruction?: string;
  history?: AssistantChatMessage[];
}

export interface AssistantClient {
  complete(request: AssistantRequest): Promise<string>;
  supportsStreaming?(serviceId: string): Promise<boolean>;
  stream?(
    request: AssistantRequest,
    onPartial: (text: string) => void,
  ): Promise<string>;
}

interface AssistantResponse {
  text: string;
}

interface AssistantPortResponse {
  type: "assistantPartial";
  requestId: string;
  text?: string;
  done: boolean;
  error?: string;
}

interface RuntimePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: { addListener(listener: () => void): void };
}

interface RuntimeApi {
  sendMessage(message: unknown): Promise<unknown>;
  connect(options: { name: string }): RuntimePort;
}

function runtimeApi(): RuntimeApi {
  const runtime = (
    globalThis as unknown as { chrome?: { runtime?: RuntimeApi } }
  ).chrome?.runtime;
  if (!runtime) throw new Error("Extension runtime is unavailable.");
  return runtime;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseText(value: unknown): string {
  if (isRecord(value) && typeof value.text === "string") return value.text;
  throw new Error("Assistant returned an invalid response.");
}

function randomId(): string {
  return `assistant-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Runtime-backed assistant client. Background wiring is documented for integration. */
export function createAssistantClient(): AssistantClient {
  return {
    async complete(request) {
      const response: unknown = await runtimeApi().sendMessage({
        type: "assistantRequest",
        request,
      });
      return responseText(response as AssistantResponse);
    },
    async supportsStreaming(serviceId) {
      const response: unknown = await runtimeApi().sendMessage({
        type: "getAssistantCapabilities",
        serviceId,
      });
      return (
        isRecord(response) &&
        typeof response.streaming === "boolean" &&
        response.streaming
      );
    },
    stream(request, onPartial) {
      return new Promise<string>((resolve, reject) => {
        const requestId = randomId();
        const port = runtimeApi().connect({ name: ASSISTANT_PORT_NAME });
        let complete = false;
        let latestText = "";

        const onMessage = (message: unknown): void => {
          if (!isRecord(message) || message.type !== "assistantPartial") return;
          const partial = message as unknown as AssistantPortResponse;
          if (partial.requestId !== requestId) return;
          if (partial.error) {
            complete = true;
            port.disconnect();
            reject(new Error(partial.error));
            return;
          }
          if (typeof partial.text === "string") {
            latestText = partial.text;
            onPartial(partial.text);
          }
          if (partial.done) {
            complete = true;
            port.disconnect();
            resolve(latestText);
          }
        };

        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(() => {
          port.onMessage.removeListener(onMessage);
          if (!complete) reject(new Error("Assistant stream disconnected."));
        });
        port.postMessage({ type: "assistantRequest", requestId, request });
      });
    },
  };
}

/** Use streaming only when the selected adapter exposes it, then fall back safely. */
export async function runAssistant(
  client: AssistantClient,
  request: AssistantRequest,
  onPartial?: (text: string) => void,
): Promise<string> {
  if (onPartial && client.stream && client.supportsStreaming) {
    try {
      if (await client.supportsStreaming(request.service)) {
        return await client.stream(request, onPartial);
      }
    } catch {
      // A worker restart or adapter failure should not lose the user's request.
    }
  }
  const text = await client.complete(request);
  onPartial?.(text);
  return text;
}
