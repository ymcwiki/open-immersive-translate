import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => {
  const listeners = new Set<(message: unknown) => void>();
  return {
    listeners,
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) =>
          listeners.add(listener),
        ),
        removeListener: vi.fn((listener: (message: unknown) => void) =>
          listeners.delete(listener),
        ),
      },
    },
  };
});

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import type { FeatureContext } from "../../src/content/features/context";
import {
  init,
  openAiWritingModal,
  parseSuggestions,
} from "../../src/content/features/ai-writing";
import type { AssistantClient } from "../../src/shared/k-assistant";

function context(): FeatureContext {
  return {
    config: {
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      service: "openai-compatible",
      aiWriting: { enabled: true },
    } as unknown as FeatureContext["config"],
    rule: { matches: ["<all_urls>"] },
    translateText: vi.fn(),
    translateParagraph: vi.fn(),
    toggleTranslate: vi.fn(),
    isTranslated: vi.fn(),
  };
}

beforeEach(() => browserMock.listeners.clear());

afterEach(() => {
  document.body.replaceChildren();
  document
    .querySelectorAll('[data-imt="ai-writing"]')
    .forEach((element) => element.remove());
  vi.restoreAllMocks();
});

describe("AI writing", () => {
  it("uses editable prompts and replaces the saved input selection", async () => {
    const input = document.createElement("textarea");
    input.value = "Please improve this sentence.";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(7, 14);
    const assistant: AssistantClient = {
      complete: vi.fn().mockResolvedValue("refine"),
    };

    openAiWritingModal(context(), assistant);
    const host = document.querySelector<HTMLElement>(
      '[data-imt="ai-writing"]',
    )!;
    const shadow = host.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('[data-action="polish"]')!.click();
    const prompt = shadow.querySelector<HTMLTextAreaElement>(".prompt")!;
    prompt.value = "Custom instruction";
    shadow.querySelector<HTMLButtonElement>('[data-command="run"]')!.click();

    await vi.waitFor(() =>
      expect(shadow.querySelector(".result")!.textContent).toContain("refine"),
    );
    expect(assistant.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "writing",
        text: "improve",
        instruction: "Custom instruction",
      }),
    );
    shadow.querySelector<HTMLButtonElement>('[data-command="insert"]')!.click();
    expect(input.value).toBe("Please refine this sentence.");
  });

  it("registers the open message and parses three suggestions", () => {
    const dispose = init(context(), {
      assistant: { complete: vi.fn().mockResolvedValue("unused") },
    });
    for (const listener of browserMock.listeners) {
      listener({ type: "openAiWriting" });
    }
    expect(document.querySelector('[data-imt="ai-writing"]')).not.toBeNull();
    expect(parseSuggestions("1. One\n2. Two\n3. Three\n4. Four")).toEqual([
      "One",
      "Two",
      "Three",
    ]);
    dispose();
    expect(browserMock.listeners.size).toBe(0);
  });
});
