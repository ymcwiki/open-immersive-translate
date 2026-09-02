import {
  OpenAICompatibleService,
  type OpenAICompatibleServiceOptions,
} from "./openai-compatible";

export interface OpenAIProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: readonly string[];
}

export const OPENAI_PROVIDER_PRESETS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "qwen",
    name: "Qwen / DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus-latest",
    models: ["qwen-plus-latest", "qwen-turbo", "qwen-max", "qwen3.5-plus"],
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: [
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
      "kimi-k2-turbo-preview",
    ],
  },
  {
    id: "zhipu",
    name: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-plus", "glm-4-long", "glm-4-air"],
  },
  {
    id: "siliconcloud",
    name: "SiliconCloud",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen3-8B",
    models: [
      "Qwen/Qwen3-8B",
      "Qwen/Qwen3-32B",
      "deepseek-ai/DeepSeek-V3",
      "tencent/Hunyuan-MT-7B",
    ],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gemma2-9b-it"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.0-flash-001",
    models: [
      "google/gemini-2.0-flash-001",
      "openai/gpt-4o-mini",
      "deepseek/deepseek-chat",
    ],
  },
  {
    id: "grok",
    name: "Grok / xAI",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini-fast",
    models: ["grok-3-mini-fast", "grok-3-fast", "grok-4"],
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.3",
    models: ["llama3.3", "qwen2.5:7b", "deepseek-r1:8b"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: [
      "mistral-small-latest",
      "mistral-medium-latest",
      "mistral-large-latest",
    ],
  },
  {
    id: "doubao",
    name: "Doubao / Ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6-flash-250715",
    models: [
      "doubao-seed-1-6-flash-250715",
      "doubao-seed-1-6-250615",
      "deepseek-v3-250324",
    ],
  },
  {
    id: "hunyuan",
    name: "Tencent Hunyuan",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    defaultModel: "hunyuan-standard",
    models: ["hunyuan-lite", "hunyuan-standard", "hunyuan-pro", "Hunyuan-MT"],
  },
  {
    id: "lingyiwanwu",
    name: "01.AI",
    baseUrl: "https://api.lingyiwanwu.com/v1",
    defaultModel: "yi-medium",
    models: ["yi-medium", "yi-large", "yi-large-turbo", "yi-spark"],
  },
  {
    id: "stepfun",
    name: "StepFun",
    baseUrl: "https://api.stepfun.com/v1",
    defaultModel: "step-2-16k",
    models: ["step-1-8k", "step-1-32k", "step-2-16k", "step-2-mini"],
  },
  {
    id: "qianfan",
    name: "Baidu Qianfan",
    baseUrl: "https://qianfan.baidubce.com/v2",
    defaultModel: "ernie-speed-128k",
    models: ["ernie-speed-128k", "ernie-4.0-8k", "deepseek-v3", "deepseek-r1"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModel: "MiniMax-M2.5",
    models: ["MiniMax-M2.5", "MiniMax-M2.1", "abab6.5s-chat"],
  },
] as const satisfies readonly OpenAIProviderPreset[];

const presetsById = new Map<string, OpenAIProviderPreset>(
  OPENAI_PROVIDER_PRESETS.map((preset) => [preset.id, preset]),
);

export function getPreset(serviceId: string): OpenAIProviderPreset | undefined {
  return presetsById.get(serviceId);
}

export function createPresetService(
  serviceId: string,
  options: OpenAICompatibleServiceOptions = {},
): OpenAICompatibleService | undefined {
  const preset = getPreset(serviceId);
  if (!preset) return undefined;
  return new OpenAICompatibleService({
    ...options,
    id: options.id ?? preset.id,
    name: options.name ?? preset.name,
    baseUrl: options.baseUrl ?? preset.baseUrl,
    model: options.model ?? preset.defaultModel,
  });
}
