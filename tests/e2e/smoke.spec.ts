import {
  expect,
  test,
  type BrowserContext,
  type BrowserType,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

interface ExtensionApi {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    query(
      query: Record<string, unknown>,
    ): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  scripting: {
    executeScript(
      details: Record<string, unknown>,
    ): Promise<Array<{ result?: unknown }>>;
  };
}

interface ExtensionWorkerGlobal {
  chrome: ExtensionApi;
}

let server: Server;
let origin: string;
let fixturePdf: Uint8Array;
let profileSequence = 0;

test.beforeAll(async () => {
  const fixture = await readFile(
    path.resolve("tests/e2e/fixtures/article.html"),
    "utf8",
  );
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdf.addPage([420, 240]);
  pdfPage.drawText("Tiny PDF paragraph for translation.", {
    x: 40,
    y: 160,
    size: 15,
    font,
  });
  fixturePdf = await pdf.save();

  server = createServer((request, response) => {
    if (request.url === "/fixture.pdf") {
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/pdf",
      });
      response.end(Buffer.from(fixturePdf));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixture);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start the fixture server.");
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function extensionWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? context.waitForEvent("serviceworker");
}

async function launchExtension(playwright: {
  chromium: BrowserType;
}): Promise<{ context: BrowserContext; worker: Worker; extensionId: string }> {
  const extensionPath = path.resolve("dist");
  const userDataDir = path.join(
    tmpdir(),
    `bilingual-translator-e2e-${process.pid}-${++profileSequence}`,
  );
  const context = await playwright.chromium.launchPersistentContext(
    userDataDir,
    {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--lang=zh-CN",
      ],
    },
  );
  const worker = await extensionWorker(context);
  return {
    context,
    worker,
    extensionId: new URL(worker.url()).host,
  };
}

async function selectMockService(
  worker: Worker,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await worker.evaluate(async (configPatch) => {
    const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
    let config: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 100 && !config; attempt += 1) {
      const stored = await api.storage.local.get("config");
      if (stored.config && typeof stored.config === "object") {
        config = stored.config as Record<string, unknown>;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    if (!config) throw new Error("Extension defaults were not installed.");
    const services = config.services as Record<string, unknown>;
    const google = services.google as Record<string, unknown> | undefined;
    if (
      config.service !== "google" ||
      google?.enabled !== true ||
      google.apiKey !== undefined
    ) {
      throw new Error("Fresh-install Google defaults are invalid.");
    }
    await api.storage.local.set({
      config: {
        ...config,
        ...configPatch,
        service: "mock",
        services: {
          ...services,
          ...((configPatch.services as Record<string, unknown> | undefined) ??
            {}),
          mock: { kind: "mock", enabled: true },
        },
        floatBall: { enabled: false, position: "right" },
        hover: { enabled: false, holdKey: "Alt" },
        selection: { enabled: false },
        input: { enabled: false, trigger: "//" },
        subtitle: {
          ...(config.subtitle as Record<string, unknown>),
          youtube: false,
        },
      },
    });
  }, patch);
}

async function sendToArticleTab(
  worker: Worker,
  message: Record<string, unknown>,
): Promise<boolean> {
  return worker.evaluate(
    async ({ pageOrigin, runtimeMessage }) => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      const tabs = await api.tabs.query({});
      const tab = tabs.find((candidate) =>
        candidate.url?.startsWith(pageOrigin),
      );
      if (tab?.id === undefined) return false;
      try {
        await api.tabs.sendMessage(tab.id, runtimeMessage);
        return true;
      } catch {
        return false;
      }
    },
    { pageOrigin: origin, runtimeMessage: message },
  );
}

async function toggleActivePage(worker: Worker): Promise<boolean> {
  return sendToArticleTab(worker, { type: "toggleTranslate" });
}

async function runPageCommand(
  worker: Worker,
  command: string,
): Promise<boolean> {
  return sendToArticleTab(worker, { type: "pageControllerCommand", command });
}

async function contentState(worker: Worker): Promise<{
  ready: boolean;
  active: boolean;
  error?: string;
}> {
  return worker.evaluate(async (pageOrigin) => {
    const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
    const tabs = await api.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url?.startsWith(pageOrigin));
    if (tab?.id === undefined) return { ready: false, active: false };
    const [execution] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        ready: window.__imt?.ready ?? false,
        active: window.__imt?.active ?? false,
        error: window.__imt?.error ? String(window.__imt.error) : undefined,
      }),
    });
    return execution?.result as {
      ready: boolean;
      active: boolean;
      error?: string;
    };
  }, origin);
}

test("translates article paragraphs once and restores the DOM", async ({
  playwright,
}) => {
  const { context, worker } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    await page.goto(`${origin}/article.html`);
    const originalBody = await page.locator("body").innerHTML();

    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    await expect
      .poll(() =>
        page
          .locator("article > p")
          .evaluateAll((paragraphs) =>
            paragraphs.map(
              (paragraph) =>
                paragraph.querySelectorAll("font[data-imt='target']").length,
            ),
          ),
      )
      .toEqual([1, 1, 1]);

    await expect(
      page.locator("article > p font[data-imt='target']"),
    ).toHaveCount(3);
    await expect(
      page.locator("article > p font[data-imt='target']").first(),
    ).toContainText("[zh]");
    await expect(page.locator("nav font[data-imt='target']")).toHaveCount(0);
    await expect(page.locator("pre font[data-imt='target']")).toHaveCount(0);
    await expect(page.locator("code font[data-imt='target']")).toHaveCount(0);

    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    await expect(page.locator("font[data-imt='target']")).toHaveCount(0);
    await expect
      .poll(() => page.locator("body").innerHTML())
      .toBe(originalBody);
  } finally {
    await context.close();
  }
});

test("applies glossary entries and toggles mask and translation-only mode", async ({
  playwright,
}) => {
  const { context, worker } = await launchExtension(playwright);
  try {
    await selectMockService(worker, {
      glossaries: [{ k: "first paragraph", v: "首段术语" }],
      translateToPageEndImmediately: true,
    });
    const page = await context.newPage();
    await page.goto(`${origin}/article.html`);
    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);

    const firstTranslation = page
      .locator("#first font[data-imt='target']")
      .first();
    await expect(firstTranslation).toContainText("[zh] This is the 首段术语");

    await expect
      .poll(() => runPageCommand(worker, "toggleTranslationMask"))
      .toBe(true);
    await expect(page.locator("html")).toHaveClass(/imt-translation-mask/u);

    await expect
      .poll(() => runPageCommand(worker, "toggleOnlyTranslation"))
      .toBe(true);
    await expect(page.locator("#first [data-imt='source']")).toHaveClass(
      /imt-source-hidden/u,
    );
    await expect(firstTranslation).toBeVisible();
  } finally {
    await context.close();
  }
});

test("opens a PDF URL and translates its extracted paragraph", async ({
  playwright,
}) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    const reader = new URL(
      `chrome-extension://${extensionId}/src/pdf/index.html`,
    );
    reader.searchParams.set("file", `${origin}/fixture.pdf`);
    await page.goto(reader.href);

    await expect(page.locator(".pdf-page-shell")).toHaveCount(1);
    await expect(page.locator(".pdf-translation").first()).toContainText(
      "[zh] Tiny PDF paragraph for translation.",
    );
  } finally {
    await context.close();
  }
});

test("translates every cue in a local SRT file", async ({ playwright }) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/src/subtitle-file/index.html`,
    );
    const srt = [
      "1",
      "00:00:00,000 --> 00:00:01,000",
      "First cue",
      "",
      "2",
      "00:00:01,500 --> 00:00:02,500",
      "Second cue",
      "",
      "3",
      "00:00:03,000 --> 00:00:04,000",
      "Third cue",
      "",
    ].join("\n");
    await page.locator("input[type='file']").setInputFiles({
      name: "fixture.srt",
      mimeType: "application/x-subrip",
      buffer: Buffer.from(srt),
    });
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await page
      .getByRole("button", {
        name: /翻译全部字幕|Translate all subtitles/u,
      })
      .click();
    await expect(page.locator("tbody tr td:last-child")).toHaveText([
      "[zh] First cue",
      "[zh] Second cue",
      "[zh] Third cue",
    ]);
  } finally {
    await context.close();
  }
});

test("loads the side panel and round-trips text through the mock service", async ({
  playwright,
}) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/src/ui/sidepanel/index.html`,
    );
    await page
      .getByRole("textbox", {
        name: /输入要翻译的文字|Enter text to translate/u,
      })
      .fill("Side panel sample");
    await page
      .getByRole("button", { name: /翻译文字|Translate text/u })
      .click();
    await expect(page.locator(".side-output")).toHaveText(
      "[zh] Side panel sample",
    );
  } finally {
    await context.close();
  }
});
