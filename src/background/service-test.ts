import type { ServiceTestResult } from "../shared/messages";
import type { LangCode, ServiceConfig } from "../shared/types";
import { createService } from "./services";
import { serializeTranslateError } from "./services/base";

export interface RunServiceTestOptions {
  targetLanguage: LangCode;
  now?: () => number;
}

/** Send a one-item request through the configured adapter and report evidence. */
export async function runServiceTest(
  serviceId: string,
  serviceConfig: ServiceConfig,
  options: RunServiceTestOptions,
): Promise<ServiceTestResult> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  try {
    const service = createService(serviceId, serviceConfig);
    const to =
      options.targetLanguage === "en" ? "zh-CN" : options.targetLanguage;
    if (!(service.supportsPair?.("en", to) ?? true)) {
      return {
        ok: false,
        latencyMs: Math.max(0, Math.round(now() - startedAt)),
        error: `${service.name} 不支持 en → ${to}`,
      };
    }
    const result = await service.translate(
      { texts: ["Hello"], from: "en", to },
      new AbortController().signal,
    );
    const itemError = result.errors?.[0];
    if (itemError) throw itemError;
    const sample = result.texts[0]?.trim();
    if (!sample) throw new Error("服务返回了空译文");
    return {
      ok: true,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      sample,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      error: serializeTranslateError(error, serviceId).message,
    };
  }
}
