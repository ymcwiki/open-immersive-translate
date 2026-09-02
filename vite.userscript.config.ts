import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         双语网页翻译
// @name:en      Bilingual Web Translator
// @namespace    https://github.com/bilingual-translator
// @version      0.0.1
// @description  在网页原文旁显示译文
// @description:en Show translations beside the original page text
// @match        http://*/*
// @match        https://*/*
// @exclude      *://*/*.pdf*
// @exclude      *://*/*.srt*
// @exclude      *://*/*.vtt*
// @exclude      *://*/*.ass*
// @exclude      *://*/*.ssa*
// @exclude      *://*/*.ttml*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @run-at       document-idle
// ==/UserScript==
/* eslint-disable */`;

export default defineConfig({
  build: {
    target: "es2020",
    outDir: "dist-userscript",
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(
        new URL("./src/userscript/index.ts", import.meta.url),
      ),
      formats: ["iife"],
      name: "BilingualTranslatorUserscript",
      fileName: () => "bilingual-translator.user.js",
    },
    rollupOptions: {
      output: {
        banner: USERSCRIPT_HEADER,
      },
    },
  },
});
