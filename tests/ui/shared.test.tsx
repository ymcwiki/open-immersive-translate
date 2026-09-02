import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  runtime: {
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { DEFAULT_CONFIG } from "../../src/shared/config";
import { Button, Card, Field, Select, Toggle } from "../../src/ui/shared";
import {
  parseConfigImport,
  serializeConfig,
} from "../../src/ui/shared/config-transfer";
import {
  languageName,
  normalizeUiLocale,
  serviceName,
  setUiLocaleOverride,
  t,
} from "../../src/ui/shared/i18n";
import { serviceFields } from "../../src/ui/shared/service-fields";
import {
  clearCache,
  getCacheCount,
  testServiceConnection,
} from "../../src/ui/shared/runtime";
import { useConfig } from "../../src/ui/shared/use-config";

beforeEach(() => {
  browserMock.runtime.sendMessage.mockReset();
  browserMock.storage.local.get.mockReset();
  browserMock.storage.local.set.mockReset();
  browserMock.storage.onChanged.addListener.mockReset();
  browserMock.storage.onChanged.removeListener.mockReset();
});

afterEach(cleanup);

describe("shared UI primitives", () => {
  it("renders fields and reports Select and Toggle changes", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <Card title="Card">
        <Field label="Choice" htmlFor="choice">
          <Select
            id="choice"
            value="one"
            options={[
              { value: "one", label: "One" },
              { value: "two", label: "Two" },
            ]}
            onChange={onSelect}
          />
        </Field>
        <Toggle checked={false} label="Switch" onChange={onToggle} />
        <Button>Save</Button>
      </Card>,
    );

    fireEvent.change(screen.getByLabelText("Choice"), {
      target: { value: "two" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Switch" }));

    expect(onSelect).toHaveBeenCalledWith("two");
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
});

describe("i18n", () => {
  it("uses Chinese by default and supports English and placeholders", () => {
    setUiLocaleOverride("auto");
    expect(t("popup.translate")).toBe("翻译");
    expect(t("popup.shortcut", { shortcut: "Alt+A" })).toContain("Alt+A");
    expect(t("popup.translate", {}, "en")).toBe("Translate");
    expect(languageName("zh-CN")).toBe("简体中文");
    expect(serviceName("custom-service")).toBe("custom-service");
  });

  it("supports Traditional Chinese and Japanese locale tables", () => {
    expect(t("popup.translate", {}, "zh-TW")).toBe("翻譯");
    expect(t("popup.translate", {}, "ja")).toBe("翻訳");
    expect(normalizeUiLocale("zh-HK")).toBe("zh-TW");
    expect(normalizeUiLocale("ja-JP")).toBe("ja");
    expect(normalizeUiLocale("fr-FR")).toBe("en");
  });
});

describe("service field descriptors", () => {
  it("drives AI and custom HTTP credential forms", () => {
    expect(
      serviceFields("openai-compatible").map(({ name }) => name),
    ).toContain("model");
    expect(serviceFields("custom-http").map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "headers",
        "requestBodyTemplate",
        "responseJsonPath",
      ]),
    );
    expect(serviceFields("google").map(({ name }) => name)).not.toContain(
      "apiKey",
    );
  });
});

describe("configuration transfer", () => {
  it("redacts API keys and validates imported JSON", () => {
    const config = {
      ...DEFAULT_CONFIG,
      services: {
        ...DEFAULT_CONFIG.services,
        "openai-compatible": {
          ...DEFAULT_CONFIG.services["openai-compatible"]!,
          apiKey: "secret",
        },
      },
    };

    expect(serializeConfig(config, true)).not.toContain("secret");
    expect(serializeConfig(config, false)).toContain("secret");
    expect(parseConfigImport("not json")).toEqual({
      ok: false,
      reason: "invalid-json",
    });
    expect(parseConfigImport('{"targetLanguage":"unsupported"}')).toEqual({
      ok: false,
      reason: "invalid-schema",
    });
    expect(parseConfigImport(JSON.stringify(config)).ok).toBe(true);
  });
});

describe("temporary runtime adapter", () => {
  it("validates service-test and cache responses", async () => {
    browserMock.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true, message: "ok" })
      .mockResolvedValueOnce({ count: 12 })
      .mockResolvedValueOnce({ cleared: 12 });

    await expect(
      testServiceConnection("google", { kind: "google" }),
    ).resolves.toEqual({ ok: true, message: "ok" });
    await expect(getCacheCount()).resolves.toBe(12);
    await expect(clearCache()).resolves.toBe(12);
    expect(browserMock.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      type: "testService",
      serviceId: "google",
      config: { kind: "google" },
    });
  });

  it("rejects malformed responses", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({ count: -1 });
    await expect(getCacheCount()).resolves.toBeUndefined();
  });
});

describe("useConfig", () => {
  it("loads, saves, and unsubscribes from storage", async () => {
    let stored = structuredClone(DEFAULT_CONFIG);
    browserMock.storage.local.get.mockImplementation(async () => ({
      config: stored,
    }));
    browserMock.storage.local.set.mockImplementation(async (value) => {
      stored = value.config;
    });

    function Harness(): preact.JSX.Element {
      const { config, updateConfig } = useConfig();
      return config ? (
        <button
          type="button"
          onClick={() => void updateConfig({ targetLanguage: "ja" })}
        >
          {config.targetLanguage}
        </button>
      ) : (
        <span>loading</span>
      );
    }

    const view = render(<Harness />);
    const button = await screen.findByRole("button", { name: "zh-CN" });
    fireEvent.click(button);

    await waitFor(() => expect(stored.targetLanguage).toBe("ja"));
    expect(screen.getByRole("button", { name: "ja" })).toBeTruthy();
    expect(browserMock.storage.onChanged.addListener).toHaveBeenCalledOnce();

    view.unmount();
    expect(browserMock.storage.onChanged.removeListener).toHaveBeenCalledOnce();
  });
});
