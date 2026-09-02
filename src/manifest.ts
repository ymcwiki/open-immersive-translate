import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Bilingual Translator",
  description: "Paragraph-level bilingual web translation.",
  version: "0.0.1",
  permissions: ["storage", "activeTab", "contextMenus", "scripting", "tabs"],
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
      resources: ["src/content/features/youtube-main.ts"],
      matches: ["*://*.youtube.com/*"],
    },
  ],
  commands: {
    "toggle-translate": {
      suggested_key: { default: "Alt+A" },
      description: "Toggle page translation",
    },
    "toggle-whole-page": {
      suggested_key: { default: "Alt+W" },
      description: "Toggle whole-page translation",
    },
    "translate-input": {
      suggested_key: { default: "Alt+I" },
      description: "Translate the active input",
    },
  },
  options_page: "options.html",
  action: {
    default_popup: "popup.html",
  },
});
