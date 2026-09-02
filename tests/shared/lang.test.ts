import { describe, expect, it } from "vitest";

import { detectLang } from "../../src/shared/lang";

describe("detectLang", () => {
  it("detects the supported major scripts", () => {
    expect(detectLang("这是一个中文句子。")).toBe("zh-CN");
    expect(detectLang("これは日本語の文章です。")).toBe("ja");
    expect(detectLang("이 문장은 한국어로 작성되었습니다.")).toBe("ko");
    expect(detectLang("Это предложение написано по-русски.")).toBe("ru");
    expect(detectLang("هذه جملة مكتوبة باللغة العربية.")).toBe("ar");
  });

  it("uses common words to distinguish Latin-script languages", () => {
    expect(detectLang("This is an article about the history of the web.")).toBe(
      "en",
    );
    expect(detectLang("Ceci est un article sur la vie et le travail.")).toBe(
      "fr",
    );
    expect(
      detectLang("Das ist ein Artikel über die Geschichte der Stadt."),
    ).toBe("de");
    expect(
      detectLang("Este es un artículo sobre la historia de la ciudad."),
    ).toBe("es");
  });

  it("abstains on short or ambiguous text", () => {
    expect(detectLang("OK")).toBe("auto");
    expect(detectLang("Codex Vite Playwright")).toBe("auto");
  });
});
