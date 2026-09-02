import type { ServiceConfig } from "../../shared/types";
import { AliyunService } from "./aliyun";
import { AzureOpenAIService } from "./azure-openai";
import { AzureTranslatorService } from "./azure-translator";
import { BaiduService } from "./baidu";
import type { TranslationService } from "./base";
import { BingService } from "./bing";
import { CaiyunService } from "./caiyun";
import { DeepLService } from "./deepl";
import { GeminiService } from "./gemini";
import { NiuTransService } from "./niutrans";
import { OpenLService } from "./openl";
import { PapagoService } from "./papago";
import {
  createPresetService,
  getPreset,
  OPENAI_PROVIDER_PRESETS,
} from "./presets";
import { phase3Config } from "./service-config";
import { TencentService } from "./tencent";
import { TransmartService } from "./transmart";
import { VolcService } from "./volc";
import { YandexFreeService } from "./yandex-free";
import { YoudaoService } from "./youdao";

export function phase3Services(): TranslationService[] {
  const presets = OPENAI_PROVIDER_PRESETS.flatMap((preset) => {
    const service = createPresetService(preset.id);
    return service ? [service] : [];
  });
  return [
    new GeminiService(),
    new DeepLService(),
    new DeepLService({ id: "deepl-pro", name: "DeepL Pro", pro: true }),
    new BingService(),
    new AzureTranslatorService(),
    new VolcService(),
    new TencentService(),
    new BaiduService(),
    new YoudaoService(),
    new CaiyunService(),
    new AliyunService(),
    new PapagoService(),
    new YandexFreeService(),
    new TransmartService(),
    new NiuTransService(),
    new OpenLService(),
    new AzureOpenAIService(),
    ...presets,
  ];
}

/** Register all phase-3 adapters through one integration call. */
export function registerPhase3Services(
  register: (service: TranslationService) => void,
): void {
  for (const service of phase3Services()) register(service);
}

export function createPhase3Service(
  id: string,
  config: ServiceConfig,
): TranslationService | undefined {
  const settings = phase3Config(config);
  const kind = settings.kind;
  const common = {
    id,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    timeoutMs: settings.timeoutMs,
    maxBatchSize: settings.maxBatchSize,
    maxBatchChars: settings.maxBatchChars,
    rateLimit: settings.rateLimit,
  };
  const preset = getPreset(id) ?? getPreset(kind);
  if (preset) {
    return createPresetService(preset.id, {
      ...common,
      id,
      model: settings.model,
      prompt: settings.prompt,
      promptSystem: settings.promptSystem,
      promptUser: settings.promptUser,
      headers: settings.headers,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      ignoreResRegexs: settings.ignoreResRegexs,
      stream: settings.stream,
    });
  }

  switch (kind) {
    case "gemini":
      return new GeminiService({
        ...common,
        model: settings.model,
        prompt: settings.prompt,
        promptSystem: settings.promptSystem,
        promptUser: settings.promptUser,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        ignoreResRegexs: settings.ignoreResRegexs,
        stream: settings.stream,
      });
    case "deepl":
    case "deepl-pro":
      return new DeepLService({
        ...common,
        pro: kind === "deepl-pro",
        formality: settings.formality,
      });
    case "bing":
      return new BingService(common);
    case "azure":
    case "azure-translator":
      return new AzureTranslatorService({ ...common, region: settings.region });
    case "volc":
      return new VolcService({
        ...common,
        appId: settings.appId,
        secret: settings.secret,
        region: settings.region,
      });
    case "tencent":
      return new TencentService({
        ...common,
        appId: settings.appId,
        secret: settings.secret,
        region: settings.region,
      });
    case "baidu":
      return new BaiduService({
        ...common,
        appId: settings.appId,
        secret: settings.secret,
      });
    case "youdao":
      return new YoudaoService({
        ...common,
        appId: settings.appId,
        secret: settings.secret,
      });
    case "caiyun":
      return new CaiyunService(common);
    case "aliyun":
      return new AliyunService({
        ...common,
        appId: settings.appId,
        secret: settings.secret,
        region: settings.region,
      });
    case "papago":
      return new PapagoService({
        ...common,
        appId: settings.appId,
        secret: settings.secret,
      });
    case "yandex-free":
      return new YandexFreeService(common);
    case "transmart":
      return new TransmartService(common);
    case "niu":
    case "niutrans":
      return new NiuTransService(common);
    case "openl":
      return new OpenLService(common);
    case "azure-openai":
      return new AzureOpenAIService({
        ...common,
        deployment: settings.deployment,
        apiVersion: settings.apiVersion,
        model: settings.model,
        prompt: settings.prompt,
        promptSystem: settings.promptSystem,
        promptUser: settings.promptUser,
        headers: settings.headers,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        ignoreResRegexs: settings.ignoreResRegexs,
        stream: settings.stream,
      });
    default:
      return undefined;
  }
}
