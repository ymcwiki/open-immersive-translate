import browser from "webextension-polyfill";

import type {
  Config,
  ConfigPatch,
  LangCode,
  Rule,
  TranslateError,
  TranslateParagraph,
} from "./types";

/** Request the merged rule for a document URL. */
export interface GetRuleMessage {
  type: "getRule";
  url: string;
}

/** Submit serializable paragraphs for scheduled translation. */
export interface TranslateMessage {
  type: "translate";
  requestId: string;
  tabId: number;
  paragraphs: TranslateParagraph[];
  from: LangCode;
  to: LangCode;
  service?: string;
  priority?: "normal" | "viewport" | "interactive";
}

/** One streamed paragraph result. */
export interface ParagraphTranslationResult {
  id: string;
  text?: string;
  error?: TranslateError;
}

/** A partial or terminal result batch pushed to a content script. */
export interface TranslateResultMessage {
  type: "translateResult";
  requestId: string;
  results: ParagraphTranslationResult[];
  done: boolean;
}

/** Cancel all work for a tab, or one request when requestId is present. */
export interface CancelMessage {
  type: "cancel";
  tabId: number;
  requestId?: string;
}

/** Read the complete local configuration. */
export interface GetConfigMessage {
  type: "getConfig";
}

/** Validate and persist a top-level configuration patch. */
export interface SetConfigMessage {
  type: "setConfig";
  patch: ConfigPatch;
}

/** Notify extension contexts that configuration changed. */
export interface ConfigChangedMessage {
  type: "configChanged";
}

/** Toggle content translation for the main region or whole page. */
export interface ToggleTranslateMessage {
  type: "toggleTranslate";
  tabId: number;
  scope?: "main" | "whole";
}

/** Ask a content script to translate the active editable field. */
export interface TranslateInputMessage {
  type: "translateInput";
  tabId: number;
}

/** Content-to-background port request; the tab id comes from Port.sender. */
export type TranslatePortMessage = Omit<TranslateMessage, "tabId">;

/** Content-to-background port cancellation; the tab id comes from Port.sender. */
export type CancelPortMessage = Omit<CancelMessage, "tabId">;

/** Every runtime and port message in the extension protocol. */
export type Msg =
  | GetRuleMessage
  | TranslateMessage
  | TranslateResultMessage
  | CancelMessage
  | GetConfigMessage
  | SetConfigMessage
  | ConfigChangedMessage
  | ToggleTranslateMessage
  | TranslateInputMessage
  | TranslatePortMessage
  | CancelPortMessage;

/** Messages accepted through runtime.sendMessage by the background worker. */
export type BackgroundRequest =
  | GetRuleMessage
  | TranslateMessage
  | CancelMessage
  | GetConfigMessage
  | SetConfigMessage;

/** Acknowledgement for work submitted to a scheduler. */
export interface TranslateAcknowledgement {
  accepted: boolean;
  error?: TranslateError;
}

/** Acknowledgement for cancellation requests. */
export interface CancelAcknowledgement {
  cancelled: boolean;
}

/** Response type selected from a concrete background request. */
export type BackgroundResponse<T extends BackgroundRequest> =
  T extends GetRuleMessage
    ? Rule
    : T extends TranslateMessage
      ? TranslateAcknowledgement
      : T extends CancelMessage
        ? CancelAcknowledgement
        : T extends GetConfigMessage
          ? Config
          : T extends SetConfigMessage
            ? Config
            : never;

/** Messages sent directly to a tab's content script. */
export type TabMessage =
  | TranslateResultMessage
  | ConfigChangedMessage
  | ToggleTranslateMessage
  | TranslateInputMessage;

/** Send a request to the background worker with an inferred response type. */
export async function sendToBackground<T extends BackgroundRequest>(
  message: T,
): Promise<BackgroundResponse<T>> {
  return (await browser.runtime.sendMessage(message)) as BackgroundResponse<T>;
}

/** Send a typed one-off message to a tab. */
export async function sendToTab<T extends TabMessage>(
  tabId: number,
  message: T,
): Promise<void> {
  await browser.tabs.sendMessage(tabId, message);
}

/** Stable name used to identify streaming translation ports. */
export const TRANSLATE_PORT_NAME = "imt:translate";

/** Messages sent from a content script over the translation port. */
export type TranslatePortRequest = TranslatePortMessage | CancelPortMessage;

/** Messages sent from the background over the translation port. */
export type TranslatePortResponse = TranslateResultMessage;

/** A typed facade over the untyped WebExtension Port API. */
export interface TypedTranslatePort<Outbound, Inbound> {
  readonly sender?: browser.Runtime.MessageSender;
  postMessage(message: Outbound): void;
  onMessage(listener: (message: Inbound) => void): () => void;
  onDisconnect(listener: () => void): () => void;
  disconnect(): void;
}

/** Content-side translation port. */
export type ContentTranslatePort = TypedTranslatePort<
  TranslatePortRequest,
  TranslatePortResponse
>;

/** Background-side translation port. */
export type BackgroundTranslatePort = TypedTranslatePort<
  TranslatePortResponse,
  TranslatePortRequest
>;

function wrapPort<Outbound, Inbound>(
  port: browser.Runtime.Port,
): TypedTranslatePort<Outbound, Inbound> {
  return {
    sender: port.sender,
    postMessage: (message) => port.postMessage(message),
    onMessage: (listener) => {
      const rawListener = (message: unknown): void =>
        listener(message as Inbound);
      port.onMessage.addListener(rawListener);
      return () => port.onMessage.removeListener(rawListener);
    },
    onDisconnect: (listener) => {
      port.onDisconnect.addListener(listener);
      return () => port.onDisconnect.removeListener(listener);
    },
    disconnect: () => port.disconnect(),
  };
}

/** Open the content-side port used for streamed translation results. */
export function connectTranslatePort(): ContentTranslatePort {
  return wrapPort<TranslatePortRequest, TranslatePortResponse>(
    browser.runtime.connect({ name: TRANSLATE_PORT_NAME }),
  );
}

/** Subscribe to background-side translation ports; returns an unsubscribe function. */
export function onTranslatePort(
  handler: (port: BackgroundTranslatePort) => void,
): () => void {
  const listener = (port: browser.Runtime.Port): void => {
    if (port.name !== TRANSLATE_PORT_NAME) return;
    handler(wrapPort<TranslatePortResponse, TranslatePortRequest>(port));
  };

  browser.runtime.onConnect.addListener(listener);
  return () => browser.runtime.onConnect.removeListener(listener);
}
