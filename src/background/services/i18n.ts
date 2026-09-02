export type ServiceUiLocale = "zh-CN" | "en";

const zhCN = {
  apiKey: "API Key",
  appId: "应用 ID / AccessKey ID",
  secret: "密钥",
  baseUrl: "接口地址",
  region: "区域",
  deployment: "部署名称",
  apiVersion: "API 版本",
  formality: "正式程度",
  model: "模型",
  models: "可选模型",
  stream: "流式输出",
  promptSystem: "系统提示词",
  promptUser: "用户提示词",
} as const;

export type ServiceI18nKey = keyof typeof zhCN;

const en: Record<ServiceI18nKey, string> = {
  apiKey: "API key",
  appId: "App / AccessKey ID",
  secret: "Secret",
  baseUrl: "Base URL",
  region: "Region",
  deployment: "Deployment",
  apiVersion: "API version",
  formality: "Formality",
  model: "Model",
  models: "Available models",
  stream: "Streaming",
  promptSystem: "System prompt",
  promptUser: "User prompt",
};

export function serviceText(
  key: ServiceI18nKey,
  locale: ServiceUiLocale = "zh-CN",
): string {
  return (locale === "en" ? en : zhCN)[key] ?? en[key];
}
