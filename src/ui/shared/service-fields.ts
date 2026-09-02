import type { ServiceConfig } from "../../shared/types";

export type ServiceFieldKey =
  | keyof Pick<
      ServiceConfig,
      | "apiKey"
      | "baseUrl"
      | "model"
      | "prompt"
      | "apiPath"
      | "temperature"
      | "maxTokens"
      | "timeoutMs"
      | "method"
      | "maxBatchSize"
      | "maxBatchChars"
      | "fallbackService"
      | "headers"
      | "requestBodyTemplate"
      | "responseJsonPath"
    >
  | "rateLimit.rps"
  | "rateLimit.concurrency";

export interface ServiceFieldDescriptor {
  key: ServiceFieldKey;
  label:
    | "apiKey"
    | "baseUrl"
    | "model"
    | "prompt"
    | "apiPath"
    | "temperature"
    | "maxTokens"
    | "timeoutMs"
    | "method"
    | "batchSize"
    | "batchChars"
    | "rps"
    | "concurrency"
    | "fallback"
    | "headers"
    | "requestBody"
    | "responsePath";
  control: "text" | "password" | "url" | "number" | "textarea" | "select";
  min?: number;
  step?: number;
  placeholder?: string;
}

const commonAi: readonly ServiceFieldDescriptor[] = [
  { key: "apiKey", label: "apiKey", control: "password" },
  { key: "baseUrl", label: "baseUrl", control: "url" },
  { key: "model", label: "model", control: "text" },
  { key: "apiPath", label: "apiPath", control: "text" },
  { key: "prompt", label: "prompt", control: "textarea" },
  {
    key: "temperature",
    label: "temperature",
    control: "number",
    min: 0,
    step: 0.1,
  },
  { key: "maxTokens", label: "maxTokens", control: "number", min: 1 },
  { key: "timeoutMs", label: "timeoutMs", control: "number", min: 1 },
  { key: "maxBatchSize", label: "batchSize", control: "number", min: 1 },
  {
    key: "rateLimit.rps",
    label: "rps",
    control: "number",
    min: 0.1,
    step: 0.1,
  },
  {
    key: "rateLimit.concurrency",
    label: "concurrency",
    control: "number",
    min: 1,
  },
  { key: "fallbackService", label: "fallback", control: "select" },
];

const transport: readonly ServiceFieldDescriptor[] = [
  { key: "timeoutMs", label: "timeoutMs", control: "number", min: 1 },
  { key: "maxBatchSize", label: "batchSize", control: "number", min: 1 },
  { key: "maxBatchChars", label: "batchChars", control: "number", min: 1 },
  {
    key: "rateLimit.rps",
    label: "rps",
    control: "number",
    min: 0.1,
    step: 0.1,
  },
  {
    key: "rateLimit.concurrency",
    label: "concurrency",
    control: "number",
    min: 1,
  },
  { key: "fallbackService", label: "fallback", control: "select" },
];

/** Expected workstream-I descriptor surface used by the generic service form. */
export function serviceFields(
  serviceId: string,
): readonly ServiceFieldDescriptor[] {
  if (serviceId === "openai-compatible" || serviceId === "claude") {
    return commonAi;
  }
  if (serviceId === "custom-http") {
    return [
      { key: "baseUrl", label: "baseUrl", control: "url" },
      { key: "method", label: "method", control: "text" },
      { key: "headers", label: "headers", control: "textarea" },
      {
        key: "requestBodyTemplate",
        label: "requestBody",
        control: "textarea",
      },
      { key: "responseJsonPath", label: "responsePath", control: "text" },
      ...transport,
    ];
  }
  if (serviceId === "deeplx") {
    return [{ key: "baseUrl", label: "baseUrl", control: "url" }, ...transport];
  }
  return transport;
}
