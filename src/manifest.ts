import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Bilingual Translator",
  description: "Paragraph-level bilingual web translation.",
  version: "0.0.1",
  permissions: [
    "storage",
    "alarms",
    "activeTab",
    "contextMenus",
    "scripting",
    "tabs",
    "webNavigation",
    "webRequest",
    "sidePanel",
  ],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "src/background/worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
      all_frames: true,
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/content/features/subtitle/main-world.ts"],
      matches: [
        "*://*.youtube.com/*",
        "*://*.youtubekids.com/*",
        "*://*.netflix.com/*",
        "*://*.primevideo.com/*",
        "*://*.amazon.com/*",
        "*://*.amazon.co.uk/*",
        "*://*.amazon.de/*",
        "*://*.amazon.co.jp/*",
        "*://*.disneyplus.com/*",
        "*://*.max.com/*",
        "*://*.hbomax.com/*",
        "*://*.hbogoasia.com/*",
        "*://*.hbogoasia.tw/*",
        "*://*.hulu.com/*",
        "*://*.coursera.org/*",
        "*://*.udemy.com/*",
        "*://*.edx.org/*",
        "*://*.khanacademy.org/*",
        "*://*.ted.com/*",
        "*://*.vimeo.com/*",
        "*://*.linkedin.com/*",
        "*://*.bilibili.com/*",
        "*://*.twitter.com/*",
        "*://*.x.com/*",
        "*://*.facebook.com/*",
        "*://*.fb.watch/*",
        "*://*.dailymotion.com/*",
      ],
    },
    {
      resources: ["src/pdf/index.html", "assets/pdf.worker.min-*.mjs"],
      matches: ["<all_urls>"],
    },
  ],
  commands: {
    toggleTranslatePage: {
      suggested_key: { default: "Alt+A" },
      description: "Toggle page translation",
    },
    toggleTranslateTheWholePage: {
      suggested_key: { default: "Alt+W" },
      description: "Toggle whole-page translation",
    },
    toggleTranslateTheMainPage: {
      suggested_key: { default: "Alt+M" },
      description: "Toggle main-area translation",
    },
    toggleOnlyTranslation: {
      suggested_key: { default: "Alt+T" },
      description: "Toggle translation-only mode",
    },
    toggleTranslateToThePageEndImmediately: {
      description: "Translate immediately to page end",
    },
    toggleTranslationMask: { description: "Toggle translation mask" },
    toggleMouseHoverTranslateDirectly: {
      description: "Toggle direct hover translation",
    },
    toggleVideoSubtitlePreTranslation: {
      description: "Toggle video subtitle pre-translation",
    },
    translateWithGoogle: { description: "Translate with Google" },
    translateWithBing: { description: "Translate with Bing" },
    translateWithDeepL: { description: "Translate with DeepL" },
    translateWithOpenAI: { description: "Translate with OpenAI" },
    translateWithClaude: { description: "Translate with Claude" },
    translateWithGemini: { description: "Translate with Gemini" },
    translateWithCustom1: { description: "Translate with Custom 1" },
    translateWithCustom2: { description: "Translate with Custom 2" },
    translateWithCustom3: { description: "Translate with Custom 3" },
    "translate-input": {
      description: "Translate the active input",
    },
    "toggle-side-panel": {
      description: "Open the translation side panel",
    },
    "open-ai-writing": { description: "Open AI writing" },
  },
  side_panel: {
    default_path: "src/ui/sidepanel/index.html",
  },
  options_page: "options.html",
  action: {
    default_popup: "popup.html",
  },
});
