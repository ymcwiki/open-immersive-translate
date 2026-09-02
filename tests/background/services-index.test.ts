import { describe, expect, it } from "vitest";

import {
  createService,
  getService,
  listServices,
} from "../../src/background/services";
import { OpenAICompatibleService } from "../../src/background/services/openai-compatible";

describe("service registry", () => {
  it("lists built-ins and creates a configured adapter with a custom id", () => {
    expect(listServices().map((service) => service.id)).toEqual([
      "openai-compatible",
      "claude",
      "google",
      "deeplx",
      "custom-http",
      "mock",
    ]);
    expect(getService("google")?.placeholder).toEqual({
      open: "<b>",
      close: "</b>",
    });
    const service = createService("private-ai", {
      kind: "openai-compatible",
      baseUrl: "https://example.test/v1",
      apiPath: "/chat/completions",
    });
    expect(service).toBeInstanceOf(OpenAICompatibleService);
    expect(service.id).toBe("private-ai");
  });
});
