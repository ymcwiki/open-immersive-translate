import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import { defineConfig, type ConfigEnv } from "vite";

import chromeManifest from "./src/manifest.ts";

export const FIREFOX_EXTENSION_ID = "bilingual-translator@local";

interface ExtensionManifestLike {
  manifest_version: number;
  name: string;
  version: string;
  [key: string]: unknown;
}

interface FirefoxBackground {
  scripts: string[];
  persistent: false;
}

interface FirefoxSidebarAction {
  default_panel: string;
  default_title: string;
}

export interface FirefoxManifest extends ExtensionManifestLike {
  background?: FirefoxBackground;
  browser_specific_settings: {
    gecko: {
      id: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  sidebar_action?: FirefoxSidebarAction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return undefined;
  }
  return [...value];
}

function firefoxBackground(value: unknown): FirefoxBackground | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value))
    throw new TypeError("Manifest background must be an object");

  const serviceWorker = value.service_worker;
  const scripts = stringArray(value.scripts);
  if (typeof serviceWorker === "string") {
    return { scripts: [serviceWorker], persistent: false };
  }
  if (scripts && scripts.length > 0) {
    return { scripts, persistent: false };
  }

  throw new TypeError("Manifest background needs a service_worker or scripts");
}

export function getSidePanelPath(
  manifest: ExtensionManifestLike,
): string | undefined {
  const sidePanel = manifest.side_panel;
  if (!isRecord(sidePanel)) return undefined;
  return typeof sidePanel.default_path === "string" &&
    sidePanel.default_path.length > 0
    ? sidePanel.default_path
    : undefined;
}

export function transformFirefoxManifest(
  manifest: ExtensionManifestLike,
): FirefoxManifest {
  const background = manifest.background;
  const browserSpecificSettings = manifest.browser_specific_settings;
  const rest = { ...manifest };
  delete rest.background;
  delete rest.browser_specific_settings;
  delete rest.side_panel;
  delete rest.sidebar_action;
  const currentSettings = isRecord(browserSpecificSettings)
    ? browserSpecificSettings
    : {};
  const currentGecko = isRecord(currentSettings.gecko)
    ? currentSettings.gecko
    : {};
  const sidePanelPath = getSidePanelPath(manifest);
  const convertedBackground = firefoxBackground(background);

  return {
    ...rest,
    ...(convertedBackground ? { background: convertedBackground } : {}),
    browser_specific_settings: {
      ...currentSettings,
      gecko: {
        ...currentGecko,
        id: FIREFOX_EXTENSION_ID,
        data_collection_permissions: {
          required: ["websiteContent"],
        },
      },
    },
    ...(sidePanelPath
      ? {
          sidebar_action: {
            default_panel: sidePanelPath,
            default_title: manifest.name,
          },
        }
      : {}),
  };
}

async function resolveChromeManifest(
  env: ConfigEnv,
): Promise<ExtensionManifestLike> {
  const resolved = await (typeof chromeManifest === "function"
    ? chromeManifest(env)
    : chromeManifest);
  return resolved as unknown as ExtensionManifestLike;
}

export default defineConfig(async (env) => {
  const sourceManifest = await resolveChromeManifest(env);
  const sidePanelPath = getSidePanelPath(sourceManifest);
  const manifest = transformFirefoxManifest(sourceManifest);

  return {
    plugins: [
      crx({
        browser: "firefox",
        manifest: manifest as unknown as ManifestV3Export,
      }),
    ],
    build: {
      outDir: "dist-firefox",
      emptyOutDir: false,
      ...(sidePanelPath ? { rollupOptions: { input: [sidePanelPath] } } : {}),
    },
  };
});
