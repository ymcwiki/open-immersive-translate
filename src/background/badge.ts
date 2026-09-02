import type {
  PageTranslationState,
  PageTranslationStateMessage,
} from "../shared/messages";

export interface BadgePresentation {
  text: string;
  color: string;
  title: string;
}

export interface BadgeActionApi {
  setBadgeText(details: { tabId: number; text: string }): void | Promise<void>;
  setBadgeBackgroundColor(details: {
    tabId: number;
    color: string;
  }): void | Promise<void>;
  setTitle(details: { tabId: number; title: string }): void | Promise<void>;
}

export interface PageStateSender {
  tab?: { id?: number };
}

const STATUS_PRESENTATION: Record<
  PageTranslationState["status"],
  Pick<BadgePresentation, "text" | "color">
> = {
  idle: { text: "", color: "#64748b" },
  translating: { text: "…", color: "#2563eb" },
  done: { text: "✓", color: "#15803d" },
  error: { text: "!", color: "#b42318" },
};

/** Convert one content-controller state snapshot to the browser-action badge. */
export function badgeForPageState(
  state: PageTranslationState,
): BadgePresentation {
  const status = STATUS_PRESENTATION[state.status];
  return {
    ...status,
    title: `翻译 ${state.translated}/${state.total}，待处理 ${state.pending}，失败 ${state.errors}`,
  };
}

export function isPageTranslationStateMessage(
  message: unknown,
): message is PageTranslationStateMessage {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "pageTranslationState" ||
    !("state" in message) ||
    typeof message.state !== "object" ||
    message.state === null
  ) {
    return false;
  }
  const state = message.state as Partial<PageTranslationState>;
  return (
    ["idle", "translating", "done", "error"].includes(state.status ?? "") &&
    [state.total, state.pending, state.translated, state.errors].every(
      (value) =>
        typeof value === "number" && Number.isInteger(value) && value >= 0,
    )
  );
}

/** Own per-tab page state and keep the action badge in sync with it. */
export class PageBadgeController {
  private readonly states = new Map<number, PageTranslationState>();

  constructor(private readonly action: BadgeActionApi) {}

  get(tabId: number): PageTranslationState | undefined {
    const state = this.states.get(tabId);
    return state ? { ...state } : undefined;
  }

  async handleMessage(
    message: unknown,
    sender: PageStateSender,
  ): Promise<{ received: true } | undefined> {
    if (!isPageTranslationStateMessage(message)) return undefined;
    const tabId = sender.tab?.id;
    if (tabId === undefined) return { received: true };
    await this.update(tabId, message.state);
    return { received: true };
  }

  async update(tabId: number, state: PageTranslationState): Promise<void> {
    this.states.set(tabId, { ...state });
    const badge = badgeForPageState(state);
    await Promise.all([
      this.action.setBadgeText({ tabId, text: badge.text }),
      this.action.setBadgeBackgroundColor({ tabId, color: badge.color }),
      this.action.setTitle({ tabId, title: badge.title }),
    ]);
  }

  async clear(tabId: number): Promise<void> {
    this.states.delete(tabId);
    await Promise.all([
      this.action.setBadgeText({ tabId, text: "" }),
      this.action.setTitle({ tabId, title: "Bilingual Translator" }),
    ]);
  }

  forget(tabId: number): void {
    this.states.delete(tabId);
  }
}
