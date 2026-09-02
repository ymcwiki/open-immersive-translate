import { describe, expect, it } from "vitest";

import {
  DEEPL_SOURCE_LANGUAGE_MAP,
  LANGUAGE_MAPS,
  providerLanguage,
  supportsMappedPair,
} from "../../../src/background/services/language-pairs";

describe("provider language mappings", () => {
  it("maps Chinese variants for Bing/Azure", () => {
    expect(providerLanguage("zh-CN", LANGUAGE_MAPS.bing)).toBe("zh-Hans");
    expect(providerLanguage("zh-TW", LANGUAGE_MAPS.azure)).toBe("zh-Hant");
  });

  it("uses DeepL's distinct source and target codes", () => {
    expect(providerLanguage("en", DEEPL_SOURCE_LANGUAGE_MAP)).toBe("EN");
    expect(providerLanguage("en", LANGUAGE_MAPS.deepl)).toBe("EN-US");
    expect(providerLanguage("zh-CN", LANGUAGE_MAPS.deepl)).toBe("ZH-HANS");
  });

  it("maps Baidu's provider-specific Japanese and Korean codes", () => {
    expect(providerLanguage("ja", LANGUAGE_MAPS.baidu)).toBe("jp");
    expect(providerLanguage("ko", LANGUAGE_MAPS.baidu)).toBe("kor");
    expect(supportsMappedPair("ja", "zh-CN", LANGUAGE_MAPS.baidu)).toBe(true);
  });
});
