import { afterEach, describe, expect, it, vi } from "vitest";

import { AliyunService } from "../../../src/background/services/aliyun";
import { AzureTranslatorService } from "../../../src/background/services/azure-translator";
import { BaiduService } from "../../../src/background/services/baidu";
import { BingService } from "../../../src/background/services/bing";
import { CaiyunService } from "../../../src/background/services/caiyun";
import { DeepLService } from "../../../src/background/services/deepl";
import { NiuTransService } from "../../../src/background/services/niutrans";
import { OpenLService } from "../../../src/background/services/openl";
import { PapagoService } from "../../../src/background/services/papago";
import { TencentService } from "../../../src/background/services/tencent";
import { TransmartService } from "../../../src/background/services/transmart";
import { VolcService } from "../../../src/background/services/volc";
import { YandexFreeService } from "../../../src/background/services/yandex-free";
import { YoudaoService } from "../../../src/background/services/youdao";

const request = {
  texts: ["hello"],
  from: "en" as const,
  to: "zh-CN" as const,
};
const signal = (): AbortSignal => new AbortController().signal;
const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official machine translation adapters", () => {
  it("calls DeepL Free with auth, tag handling, formality, and mapped language codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        translations: [{ text: "你好", detected_source_language: "EN" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DeepLService({
      apiKey: "deepl-key",
      formality: "prefer_more",
    }).translate(request, signal());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect(init.headers).toMatchObject({
      Authorization: "DeepL-Auth-Key deepl-key",
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      source_lang: "EN",
      target_lang: "ZH-HANS",
      tag_handling: "html",
      formality: "prefer_more",
    });
    expect(result.texts).toEqual(["你好"]);
  });

  it("selects DeepL's Pro endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ translations: [{ text: "你好" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await new DeepLService({ apiKey: "deepl-key", pro: true }).translate(
      request,
      signal(),
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.deepl.com/v2/translate",
    );
  });

  it("calls Azure Translator with key, region, HTML handling, and zh-Hans", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json([{ translations: [{ text: "你好", to: "zh-Hans" }] }]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AzureTranslatorService({
      apiKey: "azure-key",
      region: "eastasia",
    }).translate(request, signal());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("to=zh-Hans");
    expect(url).toContain("textType=html");
    expect(init.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "azure-key",
      "Ocp-Apim-Subscription-Region": "eastasia",
    });
    expect(result.texts).toEqual(["你好"]);
  });

  it("caches the Bing Edge bearer token", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("/auth")
          ? new Response("edge-token", { status: 200 })
          : json([{ translations: [{ text: "你好" }] }]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new BingService();

    await service.translate(request, signal());
    const result = await service.translate(request, signal());

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth")),
    ).toHaveLength(1);
    const apiCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("api-edge"),
    );
    expect(apiCall?.[0]).toContain("to=zh-Hans");
    expect(
      (apiCall as unknown as [string, RequestInit] | undefined)?.[1].headers,
    ).toMatchObject({
      Authorization: "Bearer edge-token",
    });
    expect(result.texts).toEqual(["你好"]);
  });

  it("refreshes the Bing token after an authentication failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("old-token", { status: 200 }))
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(new Response("new-token", { status: 200 }))
      .mockResolvedValueOnce(json([{ translations: [{ text: "你好" }] }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new BingService().translate(request, signal());

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).headers).toMatchObject(
      { Authorization: "Bearer new-token" },
    );
    expect(result.texts).toEqual(["你好"]);
  });

  it("signs and calls Volcengine TranslateText", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ Result: { TranslationList: [{ Translation: "你好" }] } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new VolcService({
      appId: "AKID",
      secret: "secret",
      now: () => new Date("2025-03-03T04:34:48Z"),
    }).translate(request, signal());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("Action=TranslateText&Version=2020-06-01");
    expect(init.headers).toMatchObject({ "X-Date": "20250303T043448Z" });
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      /^HMAC-SHA256 Credential=AKID\/20250303\/cn-north-1\/translate\/request/,
    );
    expect(result.texts).toEqual(["你好"]);
  });

  it("signs each Tencent TMT TextTranslate request with TC3", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ Response: { TargetText: "你好" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TencentService({
      appId: "AKID",
      secret: "secret",
      region: "ap-guangzhou",
      now: () => new Date("2019-02-25T16:44:25Z"),
    }).translate(request, signal());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "X-TC-Action": "TextTranslate",
      "X-TC-Version": "2018-03-21",
      "X-TC-Region": "ap-guangzhou",
    });
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      /^TC3-HMAC-SHA256 Credential=AKID\//,
    );
    expect(result.texts).toEqual(["你好"]);
  });

  it("uses Baidu's appid plus raw query MD5 signature", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ trans_result: [{ src: "apple", dst: "苹果" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new BaiduService({
      appId: "2015063000000001",
      secret: "1234567890",
      salt: () => "65478",
    }).translate({ ...request, texts: ["apple"] }, signal());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as URLSearchParams;
    expect(form.get("sign")).toBe("a1a7461d92e5194c5cae3182b5b24de1");
    expect(form.get("to")).toBe("zh");
    expect(result.texts).toEqual(["苹果"]);
  });

  it("uses Youdao v3 SHA-256 signing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ errorCode: "0", translation: ["你好"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new YoudaoService({
      appId: "app",
      secret: "secret",
      salt: () => "salt",
      now: () => new Date("2020-01-01T00:00:00Z"),
    }).translate(request, signal());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as URLSearchParams;
    expect(form.get("signType")).toBe("v3");
    expect(form.get("sign")).toMatch(/^[a-f0-9]{64}$/);
    expect(form.get("to")).toBe("zh-CHS");
    expect(result.texts).toEqual(["你好"]);
  });

  it("calls Alibaba TranslateGeneral with an HMAC-SHA1 signature", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ Data: { Translated: "你好" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AliyunService({
      appId: "access-id",
      secret: "secret",
      nonce: () => "nonce",
      now: () => new Date("2020-01-01T00:00:00Z"),
    }).translate(request, signal());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as URLSearchParams;
    expect(form.get("Action")).toBe("TranslateGeneral");
    expect(form.get("SignatureMethod")).toBe("HMAC-SHA1");
    expect(form.get("Signature")).toBeTruthy();
    expect(result.texts).toEqual(["你好"]);
  });
});

describe("other machine translation adapters", () => {
  it("calls Caiyun with token auth and a mapped trans_type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ target: ["你好"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CaiyunService({ apiKey: "token" }).translate(
      request,
      signal(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "x-authorization": "token token" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      trans_type: "en2zh",
    });
    expect(result.texts).toEqual(["你好"]);
  });

  it("calls Papago with client credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ translatedText: "你好" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new PapagoService({
      appId: "client",
      secret: "secret",
    }).translate(request, signal());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://papago.apigw.ntruss.com/nmt/v1/translation");
    expect(init.headers).toMatchObject({
      "X-NCP-APIGW-API-KEY-ID": "client",
      "X-NCP-APIGW-API-KEY": "secret",
    });
    expect(result.texts).toEqual(["你好"]);
  });

  it("calls the limited session-less Yandex endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ text: ["你好"] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new YandexFreeService();

    const result = await service.translate(request, signal());

    expect(service.limited).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).get("lang")).toBe("en-zh");
    expect(result.texts).toEqual(["你好"]);
  });

  it("calls Transmart's public web endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ auto_translation: [{ translation: "你好" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new TransmartService();

    const result = await service.translate(request, signal());

    expect(service.limited).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      header: { fn: "auto_translation" },
      source: { lang: "en", text_list: ["hello"] },
      target: { lang: "zh" },
    });
    expect(result.texts).toEqual(["你好"]);
  });

  it("calls NiuTrans with form-encoded credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ tgt_text: "你好" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NiuTransService({ apiKey: "niu-key" }).translate(
      request,
      signal(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).get("apikey")).toBe("niu-key");
    expect(result.texts).toEqual(["你好"]);
  });

  it("calls OpenL with bearer auth and provider language codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ translatedText: "你好" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenLService({ apiKey: "openl-key" }).translate(
      request,
      signal(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer openl-key" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      source_lang: "en",
      target_lang: "zh-CN",
    });
    expect(result.texts).toEqual(["你好"]);
  });
});
