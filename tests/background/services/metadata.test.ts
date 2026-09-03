import { describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: {} }));

import {
  getModels,
  initTranslationServices,
  listServices,
  OPENAI_PROVIDER_PRESETS,
  serviceFields,
} from "../../../src/background/services";
import { md5 } from "../../../src/background/services/crypto";
import { phase3Services } from "../../../src/background/services/phase3";
import {
  DEFAULT_PROMPTS,
  renderPromptTemplate,
} from "../../../src/background/services/prompts";
import { phase3Config } from "../../../src/background/services/service-config";

describe("translation service metadata", () => {
  it("lists all OpenAI-compatible presets and accepts custom models", () => {
    expect(OPENAI_PROVIDER_PRESETS.map(({ id }) => id)).toEqual([
      "deepseek",
      "qwen",
      "kimi",
      "zhipu",
      "siliconcloud",
      "groq",
      "openrouter",
      "grok",
      "ollama",
      "mistral",
      "doubao",
      "hunyuan",
      "lingyiwanwu",
      "stepfun",
      "qianfan",
      "minimax",
    ]);
    expect(getModels("deepseek", ["private-model"])).toContain("private-model");
  });

  it("registers phase-3 services once", () => {
    initTranslationServices();
    initTranslationServices();
    const ids = listServices().map(({ id }) => id);
    expect(ids).toContain("gemini");
    expect(ids).toContain("azure-openai");
    expect(ids).toContain("minimax");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes pair checks on every phase-3 service", () => {
    for (const service of phase3Services()) {
      expect(service.supportsPair?.("en", "zh-CN"), service.id).toBe(true);
      expect(service.supportsPair?.("en", "en"), service.id).toBe(false);
    }
  });

  it("describes generic credential and prompt fields in zh-CN with English fallback", () => {
    expect(serviceFields("tencent").map(({ name }) => name)).toEqual([
      "appId",
      "secret",
      "region",
    ]);
    expect(
      serviceFields("gemini").find(({ name }) => name === "promptSystem"),
    ).toMatchObject({
      label: "系统提示词",
      type: "textarea",
    });
    expect(
      serviceFields("deepl", "en").find(({ name }) => name === "formality")
        ?.label,
    ).toBe("Formality");
    expect(serviceFields("chatgpt").map(({ name }) => name)).toContain("auth");
    expect(serviceFields("chatgpt").map(({ name }) => name)).toEqual(
      expect.arrayContaining(["reasoningEffort", "reasoningEffortAssistant"]),
    );
    expect(serviceFields("chatgpt").map(({ name }) => name)).not.toContain(
      "apiKey",
    );
  });

  it("renders all six prompt variables and exposes subtitle and selection variants", () => {
    expect(Object.keys(DEFAULT_PROMPTS)).toEqual([
      "default",
      "subtitle",
      "selection",
    ]);
    const rendered = renderPromptTemplate(
      "{{from}}|{{to}}|{{title}}|{{summary}}|{{glossary}}|{{text}}",
      {
        texts: ["source"],
        from: "en",
        to: "zh-CN",
        context: { title: "T", summary: "S" },
        glossary: [{ k: "A", v: "B" }],
      },
      "payload",
    );
    expect(rendered).toBe("en|zh-CN|T|S|A: B|payload");
  });

  it("implements the Baidu MD5 vector locally", () => {
    expect(md5("2015063000000001apple654781234567890")).toBe(
      "a1a7461d92e5194c5cae3182b5b24de1",
    );
  });

  it("reads pending config fields with safe defaults and migrates the old prompt name", () => {
    expect(
      phase3Config({ kind: "openai-compatible", prompt: "legacy" }),
    ).toMatchObject({
      formality: "default",
      promptSystem: "legacy",
      models: [],
      stream: false,
    });
  });
});
