import { afterEach, describe, expect, it } from "vitest";

import { findMainContent, mainContentScore } from "../../src/content/extract/main-area";

afterEach(() => {
  document.body.replaceChildren();
});

describe("main-area detection", () => {
  it("selects semantic prose and excludes navigation, aside, and footer", () => {
    document.body.innerHTML = `
      <nav>${"Navigation link ".repeat(30)}</nav>
      <main id="shell">
        <article id="story"><h1>Headline</h1><p>${"Article sentence with useful detail. ".repeat(15)}</p></article>
        <aside>${"Related link ".repeat(40)}</aside>
      </main>
      <footer>${"Footer text ".repeat(40)}</footer>`;

    expect(findMainContent(document)?.id).toBe("story");
    expect(mainContentScore(document.querySelector("nav")!)).toBe(0);
    expect(mainContentScore(document.querySelector("aside")!)).toBe(0);
  });

  it("falls back to the densest non-semantic container", () => {
    document.body.innerHTML = `
      <div id="toolbar"><a>${"Menu ".repeat(30)}</a></div>
      <div id="copy"><p>${"Dense prose sentence with several words. ".repeat(12)}</p></div>`;
    expect(findMainContent(document)?.id).toBe("copy");
  });
});
