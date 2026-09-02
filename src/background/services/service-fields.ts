import { serviceText, type ServiceI18nKey, type ServiceUiLocale } from "./i18n";
import { getPreset } from "./presets";

export type ServiceFieldName = ServiceI18nKey | "auth";
export type ServiceFieldType =
  "text" | "password" | "select" | "checkbox" | "model" | "textarea" | "auth";

export interface ServiceFieldDescriptor {
  name: ServiceFieldName;
  label: string;
  type: ServiceFieldType;
  required?: boolean;
  options?: readonly string[];
  allowCustom?: boolean;
}

const credentials: Record<string, readonly ServiceI18nKey[]> = {
  gemini: ["apiKey"],
  deepl: ["apiKey", "baseUrl", "formality"],
  "deepl-pro": ["apiKey", "baseUrl", "formality"],
  bing: [],
  "azure-translator": ["apiKey", "region", "baseUrl"],
  volc: ["appId", "secret", "region"],
  tencent: ["appId", "secret", "region"],
  baidu: ["appId", "secret"],
  youdao: ["appId", "secret"],
  caiyun: ["apiKey"],
  aliyun: ["appId", "secret", "region"],
  papago: ["appId", "secret"],
  "yandex-free": [],
  transmart: [],
  niutrans: ["apiKey", "baseUrl"],
  openl: ["apiKey", "baseUrl"],
  "azure-openai": ["apiKey", "baseUrl", "deployment", "apiVersion"],
  google: [],
  deeplx: ["baseUrl"],
  "custom-http": [
    "baseUrl",
    "method",
    "headers",
    "requestBodyTemplate",
    "responseJsonPath",
  ],
};

const aiFields: readonly ServiceI18nKey[] = [
  "apiKey",
  "baseUrl",
  "model",
  "models",
  "stream",
  "promptSystem",
  "promptUser",
  "apiPath",
  "temperature",
  "maxTokens",
  "timeoutMs",
  "maxBatchSize",
  "maxBatchChars",
  "fallbackService",
];

const transportFields: readonly ServiceI18nKey[] = [
  "timeoutMs",
  "maxBatchSize",
  "maxBatchChars",
  "fallbackService",
];

function fieldType(name: ServiceFieldName): ServiceFieldType {
  if (name === "auth") return "auth";
  if (name === "apiKey" || name === "secret") return "password";
  if (name === "stream") return "checkbox";
  if (name === "formality") return "select";
  if (name === "model") return "model";
  if (
    name === "models" ||
    name === "promptSystem" ||
    name === "promptUser" ||
    name === "prompt" ||
    name === "headers" ||
    name === "requestBodyTemplate"
  )
    return "textarea";
  if (
    name === "temperature" ||
    name === "maxTokens" ||
    name === "timeoutMs" ||
    name === "maxBatchSize" ||
    name === "maxBatchChars"
  )
    return "text";
  return "text";
}

export function getModels(
  serviceId: string,
  customModels: readonly string[] = [],
): readonly string[] {
  const fixed: Record<string, readonly string[]> = {
    "openai-compatible": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    claude: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    "azure-openai": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    chatgpt: [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.4-mini",
      "gpt-5.4",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
    ],
  };
  return [
    ...new Set([
      ...(getPreset(serviceId)?.models ?? fixed[serviceId] ?? []),
      ...customModels,
    ]),
  ];
}

/** Generic options-page field contract with zh-CN labels and English fallback. */
export function serviceFields(
  serviceId: string,
  locale: ServiceUiLocale = "zh-CN",
): readonly ServiceFieldDescriptor[] {
  if (serviceId === "chatgpt") {
    return [
      "auth",
      "model",
      "promptSystem",
      "promptUser",
      "timeoutMs",
      "maxBatchSize",
      "maxBatchChars",
      "fallbackService",
    ].map((name) => ({
      name: name as ServiceFieldName,
      label:
        name === "auth"
          ? "ChatGPT OAuth"
          : serviceText(name as ServiceI18nKey, locale),
      type: fieldType(name as ServiceFieldName),
      ...(name === "model"
        ? { options: getModels(serviceId), allowCustom: true }
        : {}),
    }));
  }
  const isAi =
    Boolean(getPreset(serviceId)) ||
    ["openai-compatible", "claude", "gemini", "azure-openai"].includes(
      serviceId,
    );
  const names = isAi
    ? [
        ...(credentials[serviceId] ?? ["apiKey", "baseUrl"]),
        ...aiFields.filter(
          (name) => !(credentials[serviceId] ?? []).includes(name),
        ),
      ]
    : [
        ...(credentials[serviceId] ?? []),
        ...(["google", "deeplx", "custom-http"].includes(serviceId)
          ? transportFields.filter(
              (name) => !(credentials[serviceId] ?? []).includes(name),
            )
          : []),
      ];
  return names.map((name) => ({
    name,
    label: serviceText(name, locale),
    type: fieldType(name),
    ...(name === "apiKey" || name === "appId" || name === "secret"
      ? { required: true }
      : {}),
    ...(name === "formality"
      ? { options: ["default", "more", "less", "prefer_more", "prefer_less"] }
      : {}),
    ...(name === "model"
      ? { options: getModels(serviceId), allowCustom: true }
      : {}),
  }));
}
