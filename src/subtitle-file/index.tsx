import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { sendToBackground } from "../shared/messages";
import type { Config } from "../shared/types";
import {
  parseSubtitleFile,
  serializeSubtitleFile,
  translatedFilename,
  type SubtitleFileDocument,
} from "./file-formats";
import { subtitleFileText as t } from "./i18n";
import { translateSubtitleFileCues } from "./translator";
import "./subtitle-file.css";

function cueTime(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function download(
  document: SubtitleFileDocument,
  mode: "bilingual" | "translation-only",
): void {
  const blob = new Blob([serializeSubtitleFile(document, mode)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = translatedFilename(document, mode);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SubtitleFilePage(): preact.JSX.Element {
  const [config, setConfig] = useState<Config>();
  const [document, setDocument] = useState<SubtitleFileDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void sendToBackground({ type: "getConfig" })
      .then(setConfig)
      .catch(() => setError(t("configFailed")));
  }, []);

  const chooseFile = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const next = parseSubtitleFile(file.name, await file.text());
      setDocument(next);
      setError(next.cues.length ? "" : t("noCues"));
    } catch {
      setDocument(undefined);
      setError(t("loadFailed"));
    }
  };

  const translateAll = async (): Promise<void> => {
    if (!document || !config || busy) return;
    setBusy(true);
    setError("");
    try {
      const cues = await translateSubtitleFileCues(document.cues, config);
      setDocument({ ...document, cues });
    } catch {
      setError(t("translateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const translated = document?.cues.some(
    (cue) => cue.translation !== undefined,
  );
  return (
    <main>
      <header>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>
      <section class="toolbar" aria-label={t("title")}>
        <label class="file-button">
          {t("chooseFile")}
          <input
            type="file"
            accept=".srt,.vtt,.ass,.ssa,text/vtt"
            onChange={(event) => void chooseFile(event)}
          />
        </label>
        <button
          disabled={!document?.cues.length || !config || busy}
          onClick={() => void translateAll()}
        >
          {busy ? t("translating") : t("translate")}
        </button>
        <button
          disabled={!document || !translated}
          onClick={() => document && download(document, "bilingual")}
        >
          {t("downloadBilingual")}
        </button>
        <button
          disabled={!document || !translated}
          onClick={() => document && download(document, "translation-only")}
        >
          {t("downloadTranslation")}
        </button>
      </section>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {!document && !error && <p class="empty">{t("empty")}</p>}
      {document && (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("time")}</th>
                <th>{t("source")}</th>
                <th>{t("translation")}</th>
              </tr>
            </thead>
            <tbody>
              {document.cues.map((cue, index) => (
                <tr key={`${cue.start}-${index}`}>
                  <td>
                    {cueTime(cue.start)}
                    <br />
                    {cueTime(cue.end)}
                  </td>
                  <td>{cue.text}</td>
                  <td>{cue.translation ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const root = document.querySelector("#app");
if (root) render(<SubtitleFilePage />, root);
