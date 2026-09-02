import { describe, expect, it, vi } from "vitest";

import {
  runAssistant,
  type AssistantClient,
  type AssistantRequest,
} from "../../src/shared/k-assistant";

const request: AssistantRequest = {
  kind: "translate",
  text: "hello",
  service: "openai-compatible",
  from: "en",
  to: "zh-CN",
};

describe("runAssistant", () => {
  it("uses partial output for a streaming adapter", async () => {
    const onPartial = vi.fn();
    const client: AssistantClient = {
      complete: vi.fn(),
      supportsStreaming: vi.fn().mockResolvedValue(true),
      stream: vi.fn().mockImplementation(async (_request, partial) => {
        partial("你");
        partial("你好");
        return "你好";
      }),
    };

    await expect(runAssistant(client, request, onPartial)).resolves.toBe(
      "你好",
    );
    expect(onPartial).toHaveBeenNthCalledWith(2, "你好");
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("falls back when streaming is unavailable or fails", async () => {
    const client: AssistantClient = {
      complete: vi.fn().mockResolvedValue("fallback"),
      supportsStreaming: vi.fn().mockResolvedValue(true),
      stream: vi.fn().mockRejectedValue(new Error("disconnected")),
    };

    await expect(runAssistant(client, request, vi.fn())).resolves.toBe(
      "fallback",
    );
    expect(client.complete).toHaveBeenCalledWith(request);
  });
});
