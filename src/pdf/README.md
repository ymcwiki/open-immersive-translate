# PDF reader notes

- PDF.js and its worker are bundled locally. The reader does not load scripts, workers, or fonts from a CDN.
- The bilingual export embeds and subsets the bundled Noto Sans SC font. It covers Simplified Chinese, common Japanese glyphs, punctuation, and Latin text. Unsupported glyphs, including Hangul, Arabic, and Thai, are replaced with `□` in the exported PDF. The in-browser reader is unaffected.
- Export writes translations below the detected source paragraph box. It preserves the original pages but does not reflow surrounding PDF content.
