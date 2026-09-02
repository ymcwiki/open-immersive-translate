import { beforeEach, describe, expect, it } from "vitest";

import {
  extractParagraphs,
  extractTitle,
  scanParagraphs,
} from "../../src/content/extract/scanner";
import { generalRule } from "../../src/background/rules/defaults";
import type { Rule } from "../../src/shared/types";

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    ...generalRule,
    isTranslateTitle: false,
    ...overrides,
  };
}

function load(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><title>Fixture title</title></head><body>${html}</body></html>`,
    "text/html",
  );
}

function texts(html: string, overrides: Partial<Rule> = {}): string[] {
  const doc = load(html);
  return extractParagraphs(doc.body, rule(overrides)).map(
    (paragraph) => paragraph.text,
  );
}

describe("paragraph scanner fixtures", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("extracts a GitHub issue body without its code block", () => {
    const result = texts(`
      <main>
        <h1><strong>Crash</strong> when saving</h1>
        <div class="comment-body">
          <p>Run <code>pnpm test</code> before opening the issue.</p>
          <pre><code>throw new Error("not prose")</code></pre>
          <p>Read <a href="/docs">the guide</a> for details.</p>
        </div>
      </main>
    `);

    expect(result).toEqual([
      "{1}Crash{/1} when saving",
      "Run {1} before opening the issue.",
      "Read {1}the guide{/1} for details.",
    ]);
  });

  it("extracts a Reddit thread as independent post and comment paragraphs", () => {
    const result = texts(`
      <main>
        <article>
          <h1>Why does this happen?</h1>
          <p class="post-text">The original post has enough detail.</p>
        </article>
        <section class="comments">
          <div class="comment"><p>First useful reply.</p></div>
          <div class="comment"><p>Second useful reply.</p></div>
        </section>
      </main>
    `);

    expect(result).toEqual([
      "Why does this happen?",
      "The original post has enough detail.",
      "First useful reply.",
      "Second useful reply.",
    ]);
  });

  it("extracts a Wikipedia article section in document order", () => {
    const result = texts(`
      <section id="History">
        <h2>History</h2>
        <p>The project began in a small research group.</p>
        <p>It later became a public encyclopedia.</p>
      </section>
    `);

    expect(result).toEqual([
      "History",
      "The project began in a small research group.",
      "It later became a public encyclopedia.",
    ]);
  });

  it("extracts each Hacker News comment separately", () => {
    const result = texts(`
      <table class="comment-tree"><tbody>
        <tr><td class="comment">The first comment adds context.</td></tr>
        <tr><td class="comment">A second comment challenges it.</td></tr>
        <tr><td class="comment">The final comment links evidence.</td></tr>
      </tbody></table>
    `);

    expect(result).toEqual([
      "The first comment adds context.",
      "A second comment challenges it.",
      "The final comment links evidence.",
    ]);
  });

  it("skips a navigation bar of thirty links", () => {
    const links = Array.from(
      { length: 30 },
      (_, index) => `<a href="/${index + 1}">Link ${index + 1}</a>`,
    ).join("");
    const result = texts(`<nav>${links}</nav>`);

    expect(result).toEqual([]);
  });

  it("splits a long br-separated lyrics block into lines", () => {
    expect(
      texts(
        "<div>First lyric line<br>Second lyric line<br>Third lyric line</div>",
      ),
    ).toEqual(["First lyric line", "Second lyric line", "Third lyric line"]);
  });

  it("keeps br elements as placeholders below the split threshold", () => {
    expect(
      texts("<div>Short line<br>Next line</div>", {
        lineBreakMaxTextCount: 100,
      }),
    ).toEqual(["Short line{1}Next line"]);
  });

  it("skips code blocks but keeps inline code as a placeholder", () => {
    const result = texts(`
      <pre><code>const secret = true;</code></pre>
      <p>Use <code>npm run build</code> before publishing.</p>
    `);

    expect(result).toEqual(["Use {1} before publishing."]);
  });

  it("descends into configured shadow roots", () => {
    const doc = load("");
    const host = doc.createElement("issue-card");
    doc.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>Text inside the component.</p>";

    const result = extractParagraphs(
      doc.body,
      rule({ shadowRootSelectors: ["issue-card"] }),
    );

    expect(result.map((paragraph) => paragraph.text)).toEqual([
      "Text inside the component.",
    ]);
  });

  it("skips contenteditable, no-translate, injected, and invisible subtrees", () => {
    const result = texts(`
      <div contenteditable="true"><p>Editable draft.</p></div>
      <div translate="no"><p>Do not translate.</p></div>
      <div class="notranslate"><p>Class excluded.</p></div>
      <div data-imt><p>Injected translation.</p></div>
      <div style="display:none"><p>Invisible text.</p></div>
      <p>Visible paragraph.</p>
    `);

    expect(result).toEqual(["Visible paragraph."]);
  });
});

describe("paragraph scanner rules", () => {
  it("restricts extraction to configured selector roots", () => {
    const doc = load(`
      <aside><p>Outside text.</p></aside>
      <main class="article"><p>Inside text.</p></main>
    `);

    expect(
      extractParagraphs(doc.body, rule({ selectors: [".article"] })).map(
        (paragraph) => paragraph.text,
      ),
    ).toEqual(["Inside text."]);
  });

  it("honors an excluded ancestor when the scan starts inside it", () => {
    const doc = load('<div class="skip"><p>Nested excluded text.</p></div>');
    const nestedRoot = doc.querySelector("p");
    expect(nestedRoot).not.toBeNull();

    expect(
      extractParagraphs(
        nestedRoot as Element,
        rule({ excludeSelectors: [".skip"] }),
      ),
    ).toEqual([]);
  });

  it("extracts block children from a document fragment", () => {
    const fragment = document.createDocumentFragment();
    const paragraph = document.createElement("p");
    paragraph.textContent = "Fragment paragraph.";
    fragment.append(paragraph);

    expect(
      extractParagraphs(fragment, rule()).map((item) => item.text),
    ).toEqual(["Fragment paragraph."]);
  });

  it("treats atomic blocks as a single paragraph", () => {
    expect(
      texts(
        '<section class="atomic"><p>First part.</p><p>Second part.</p></section>',
        { atomicBlockSelectors: [".atomic"] },
      ),
    ).toEqual(["{1}First part.{/1}{2}Second part.{/2}"]);
  });

  it("honors extra inline and block selectors", () => {
    const result = texts(
      `<section><div class="inline">Inline item.</div> Tail text.</section>
       <div><span class="block">Block item.</span><span>Final item.</span></div>`,
      {
        extraInlineSelectors: [".inline"],
        extraBlockSelectors: [".block"],
      },
    );

    expect(result).toEqual([
      "{1}Inline item.{/1} Tail text.",
      "Block item.",
      "{1}Final item.{/1}",
    ]);
  });

  it("produces stable ids and keeps the phase-0 scanner alias", () => {
    const doc = load("<main><p>Stable paragraph text.</p></main>");
    const configured = rule();

    const first = extractParagraphs(doc.body, configured);
    const second = scanParagraphs(doc.body, configured);

    expect(first.map((paragraph) => paragraph.id)).toEqual(
      second.map((paragraph) => paragraph.id),
    );
  });

  it("extracts the title only when enabled", () => {
    const doc = load("<p>Body paragraph.</p>");

    expect(extractTitle(doc, rule({ isTranslateTitle: true }))?.text).toBe(
      "Fixture title",
    );
    expect(extractTitle(doc, rule({ isTranslateTitle: false }))).toBeNull();
    expect(
      extractParagraphs(doc, rule({ isTranslateTitle: true })).map(
        (paragraph) => paragraph.text,
      ),
    ).toEqual(["Fixture title", "Body paragraph."]);
  });
});
