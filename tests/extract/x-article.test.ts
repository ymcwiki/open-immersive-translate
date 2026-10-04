import { describe, expect, it } from "vitest";

import { matchRule } from "../../src/background/rules/match";
import { extractParagraphs } from "../../src/content/extract/scanner";
import { decode } from "../../src/content/extract/placeholder";

// X renders its published articles with Draft.js, including contenteditable=false.
const articleHtml = `
  <article data-testid="twitterArticleReadView">
    <div data-testid="User-Name">Author name</div>
    <div data-testid="twitter-article-title">An article worth translating</div>
    <button>Share this article</button>
    <div data-testid="twitterArticleRichTextView">
      <div class="DraftEditor-root"><div class="DraftEditor-editorContainer">
        <div class="public-DraftEditor-content" contenteditable="false"
             data-testid="longformRichTextComponent">
          <div data-contents="true">
            <div class="longform-unstyled" data-block="true">
              <div class="public-DraftStyleDefault-block"><span data-offset-key="a"><span data-text="true">First paragraph with </span></span><span style="font-style:italic"><span data-text="true">emphasis.</span></span></div>
            </div>
            <div class="longform-unstyled" data-block="true">
              <div class="public-DraftStyleDefault-block"><span style="font-weight:bold"><span data-text="true">A bold claim.</span></span> Read <a href="https://example.com/source">the source</a>.</div>
            </div>
            <ol class="public-DraftStyleDefault-ol">
              <li data-block="true"><div class="public-DraftStyleDefault-block">First list item.</div></li>
              <li data-block="true"><div class="public-DraftStyleDefault-block">Second list item.</div></li>
            </ol>
            <section data-block="true" contenteditable="false">
              <div data-testid="tweetText"><span>Embedded tweet.</span></div>
            </section>
          </div>
        </div>
      </div></div>
    </div>
  </article>
  <aside data-testid="sidebarColumn"><div data-testid="tweetText">Sidebar teaser.</div></aside>
  <div contenteditable="true"><div data-testid="tweetText">Unpublished draft.</div></div>
`;

describe("X article extraction", () => {
  it.each([
    "https://x.com/author/status/123",
    "https://twitter.com/i/article/123",
  ])(
    "extracts published article paragraphs with the merged rule for %s",
    (url) => {
      const doc = new DOMParser().parseFromString(articleHtml, "text/html");
      const rule = matchRule(url);
      const paragraphs = extractParagraphs(doc.body, rule);
      const decoded = paragraphs.map((paragraph) => {
        const container = doc.createElement("div");
        container.append(
          decode(paragraph.text, paragraph.placeholders, {
            open: "{",
            close: "}",
          }),
        );
        return container;
      });

      expect(decoded.map((container) => container.textContent)).toEqual([
        "An article worth translating",
        "First paragraph with emphasis.",
        "A bold claim. Read the source.",
        "First list item.",
        "Second list item.",
        "Embedded tweet.",
      ]);
      expect(
        decoded[1].querySelector('[style="font-style:italic"]')?.textContent,
      ).toBe("emphasis.");
      expect(
        decoded[2].querySelector('[style="font-weight:bold"]')?.textContent,
      ).toBe("A bold claim.");
      expect(decoded[2].querySelector("a")?.getAttribute("href")).toBe(
        "https://example.com/source",
      );
      expect(
        paragraphs
          .slice(1, 5)
          .every(({ container }) =>
            container.classList.contains("public-DraftStyleDefault-block"),
          ),
      ).toBe(true);

      // The mutation observer can rescan a newly mounted article body directly.
      const body = doc.querySelector(
        '[data-testid="twitterArticleRichTextView"]',
      )!;
      expect(extractParagraphs(body, rule).map(({ id }) => id)).toEqual(
        paragraphs.slice(1).map(({ id }) => id),
      );
    },
  );
});
