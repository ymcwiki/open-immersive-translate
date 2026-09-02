import { describe, expect, it } from "vitest";

import {
  detectPageLanguage,
  detectTextLanguage,
  isParagraphTargetLanguage,
} from "../../src/content/extract/language";

describe("advanced language detection", () => {
  it.each([
    ["en", "This is the story of a city and the people who live in it."],
    ["fr", "Ceci est une histoire de la ville et des personnes qui vivent dans cette région."],
    ["de", "Das ist die Geschichte der Stadt und der Menschen, die dort leben."],
    ["es", "Esta es la historia de la ciudad y de las personas que viven en ella."],
    ["it", "Questa è la storia della città e delle persone che vivono nel paese."],
    ["pt", "Esta é a história da cidade e das pessoas que vivem com uma família."],
    ["vi", "Đây là một câu chuyện về những người đã sống trong thành phố và có gia đình."],
    ["ru", "Это история о городе и о людях, которые живут в нём много лет."],
    ["ja", "これは町で暮らしている人々についての物語です。"],
    ["ko", "이 글은 도시에 사는 사람들에 대한 이야기입니다."],
    ["zh-CN", "这是一个关于城市生活和当地居民的完整故事。"],
    ["ar", "هذه قصة عن المدينة وعن الناس الذين يعيشون فيها منذ سنوات."],
    ["th", "นี่เป็นเรื่องราวของผู้คนที่อาศัยอยู่ในเมืองและทำงานเพื่อครอบครัว"],
  ] as const)("detects %s samples", (language, text) => {
    expect(detectTextLanguage(text)).toBe(language);
  });

  it("uses html lang before sampled body text", () => {
    document.documentElement.lang = "pt-BR";
    document.body.textContent = "This is an English page with the words that detection uses.";
    expect(detectPageLanguage(document)).toBe("pt");
  });

  it("abstains on ambiguous labels and skips target-language paragraphs", () => {
    expect(detectTextLanguage("Vite Codex API")).toBe("auto");
    expect(isParagraphTargetLanguage("这是一个完整的中文段落。", "zh-CN")).toBe(true);
    expect(isParagraphTargetLanguage("This is an English paragraph on the page.", "zh-CN")).toBe(false);
  });
});
