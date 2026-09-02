import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decode,
  decodePlaceholders,
  encode,
  encodePlaceholders,
} from "../../src/content/extract/placeholder";

const braces = { open: "{", close: "}" };
const bold = { open: "<b>", close: "</b>" };

function sourceNodes(html: string): Node[] {
  const source = document.createElement("div");
  source.innerHTML = html;
  return Array.from(source.childNodes);
}

function fragmentHtml(fragment: DocumentFragment): string {
  const output = document.createElement("div");
  output.append(fragment);
  return output.innerHTML;
}

describe("placeholder encoding and decoding", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("round-trips paired, nested, void, and stay-original elements", () => {
    const encoded = encode(
      sourceNodes(
        'Read <a href="/guide"><strong>this</strong></a> <img src="x.png"> <code>npm test</code>.',
      ),
      braces,
    );

    expect(encoded.text).toBe("Read {1}{2}this{/2}{/1} {3} {4}.");
    expect(encoded.placeholders.size).toBe(4);

    const decoded = decode(
      "Lire {1}{2}ceci{/2}{/1} {3} {4}.",
      encoded.placeholders,
      braces,
    );

    expect(fragmentHtml(decoded)).toBe(
      'Lire <a href="/guide"><strong>ceci</strong></a> <img src="x.png"> <code>npm test</code>.',
    );
  });

  it("restores elements in translated placeholder order", () => {
    const encoded = encode(
      sourceNodes("<em>one</em> then <strong>two</strong>"),
      braces,
    );
    const decoded = decode(
      "{2}deux{/2} puis {1}un{/1}",
      encoded.placeholders,
      braces,
    );

    expect(fragmentHtml(decoded)).toBe(
      "<strong>deux</strong> puis <em>un</em>",
    );
  });

  it("supports HTML delimiter tokens and the contract aliases", () => {
    const encoded = encodePlaceholders(
      sourceNodes('<a href="/">word</a>'),
      bold,
    );
    expect(encoded.text).toBe("<b>1</b>word<b>/1</b>");

    const decoded = decodePlaceholders(
      "<b>1</b>mot<b>/1</b>",
      encoded.placeholders,
      bold,
    );
    expect(fragmentHtml(decoded)).toBe('<a href="/">mot</a>');
  });

  it("drops malformed and missing markers while ignoring unknown extras", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const encoded = encode(
      sourceNodes("<span>first</span><span>second</span>"),
      braces,
    );

    const decoded = decode(
      "{99}extra{/99} {1}kept",
      encoded.placeholders,
      braces,
    );

    expect(fragmentHtml(decoded)).toBe("extra kept");
    expect(warn).toHaveBeenCalledWith(
      "[imt] Dropped unmatched opening placeholder 1",
    );
    expect(warn).toHaveBeenCalledWith(
      "[imt] Translation omitted placeholder 2",
    );
  });

  it("ignores duplicate placeholder pairs without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const encoded = encode(sourceNodes("<em>one</em>"), braces);

    const decoded = decode(
      "{1}un{/1} plus {1}duplicate{/1}",
      encoded.placeholders,
      braces,
    );

    expect(fragmentHtml(decoded)).toBe("<em>un</em> plus duplicate");
    expect(warn).not.toHaveBeenCalled();
  });

  it("preserves rule-specific stay-original elements", () => {
    const encoded = encode(
      sourceNodes('<span class="formula">x + y</span> text'),
      braces,
      (element) => element.classList.contains("formula"),
    );
    const decoded = decode("{1} texte", encoded.placeholders, braces);

    expect(encoded.text).toBe("{1} text");
    expect(fragmentHtml(decoded)).toBe(
      '<span class="formula">x + y</span> texte',
    );
  });
});
