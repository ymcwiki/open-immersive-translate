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
  prompt: "系统提示词（旧版）",
  apiPath: "API 路径",
  temperature: "温度",
  maxTokens: "最大输出 token",
  timeoutMs: "超时（毫秒）",
  method: "请求方法",
  maxBatchSize: "批大小",
  maxBatchChars: "批字符数",
  fallbackService: "备用服务",
  headers: "请求头 JSON",
  requestBodyTemplate: "请求体模板",
  responseJsonPath: "响应 JSON 路径",
  reasoningEffort: "翻译思考强度",
  reasoningEffortAssistant: "助手思考强度",
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
  prompt: "System prompt (legacy)",
  apiPath: "API path",
  temperature: "Temperature",
  maxTokens: "Maximum output tokens",
  timeoutMs: "Timeout (ms)",
  method: "Request method",
  maxBatchSize: "Batch size",
  maxBatchChars: "Batch characters",
  fallbackService: "Fallback service",
  headers: "Headers JSON",
  requestBodyTemplate: "Request body template",
  responseJsonPath: "Response JSON path",
  reasoningEffort: "Translation reasoning effort",
  reasoningEffortAssistant: "Assistant reasoning effort",
};

export function serviceText(
  key: ServiceI18nKey,
  locale: ServiceUiLocale = "zh-CN",
): string {
  return (locale === "en" ? en : zhCN)[key] ?? en[key];
}
