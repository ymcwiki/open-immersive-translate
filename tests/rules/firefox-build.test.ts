import { describe, expect, it } from "vitest";

import {
  FIREFOX_EXTENSION_ID,
  getSidePanelPath,
  transformFirefoxManifest,
} from "../../vite.firefox.config";

const baseManifest = {
  manifest_version: 3,
  name: "Bilingual Translator",
  version: "0.0.1",
  permissions: ["storage"],
};

describe("Firefox manifest transform", () => {
  it("converts a Chrome MV3 service worker without mutating its source", () => {
    const source = {
      ...baseManifest,
      background: {
        service_worker: "src/background/worker.ts",
        type: "module",
      },
    };

    const transformed = transformFirefoxManifest(source);

    expect(transformed.background).toEqual({
      scripts: ["src/background/worker.ts"],
      persistent: false,
    });
    expect(transformed.browser_specific_settings.gecko.id).toBe(
      FIREFOX_EXTENSION_ID,
    );
    expect(
      transformed.browser_specific_settings.gecko.data_collection_permissions,
    ).toEqual({ required: ["websiteContent"] });
    expect(transformed).not.toHaveProperty("side_panel");
    expect(source.background).toEqual({
      service_worker: "src/background/worker.ts",
      type: "module",
    });
  });

  it("maps a Chrome side panel to a Firefox sidebar action", () => {
    const source = {
      ...baseManifest,
      permissions: ["storage", "sidePanel"],
      side_panel: { default_path: "side-panel.html" },
    };

    expect(getSidePanelPath(source)).toBe("side-panel.html");
    expect(transformFirefoxManifest(source).sidebar_action).toEqual({
      default_panel: "side-panel.html",
      default_title: "Bilingual Translator",
    });
    expect(transformFirefoxManifest(source)).not.toHaveProperty("side_panel");
    expect(transformFirefoxManifest(source).permissions).toEqual(["storage"]);
  });

  it("omits sidebar_action when no side panel exists", () => {
    expect(transformFirefoxManifest(baseManifest)).not.toHaveProperty(
      "sidebar_action",
    );
  });

  it("preserves existing Firefox settings while pinning the extension id", () => {
    const transformed = transformFirefoxManifest({
      ...baseManifest,
      browser_specific_settings: {
        gecko: { id: "old@example.com", strict_min_version: "121.0" },
      },
    });

    expect(transformed.browser_specific_settings.gecko).toEqual({
      id: FIREFOX_EXTENSION_ID,
      strict_min_version: "121.0",
      data_collection_permissions: { required: ["websiteContent"] },
    });
  });

  it("rejects a malformed background declaration", () => {
    expect(() =>
      transformFirefoxManifest({
        ...baseManifest,
        background: { page: "background.html" },
      }),
    ).toThrow("Manifest background needs a service_worker or scripts");
  });
});
