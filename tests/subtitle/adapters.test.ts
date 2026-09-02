import { describe, expect, it, vi } from "vitest";

import type { SubtitleNetworkFormat } from "../../src/shared/subtitle-types";
import bilibiliFixture from "./fixtures/bilibili-subtitle.json?raw";
import ttmlFixture from "./fixtures/streaming.ttml?raw";
import webVttFixture from "./fixtures/captured-captions.vtt?raw";

import {
  matchingSubtitleAdapters,
  SubtitleCaptureHub,
  textTrackCues,
} from "../../src/content/features/subtitle/adapters";

describe("subtitle adapters", () => {
  it.each([
    ["https://www.youtube.com/watch?v=1", "youtube"],
    ["https://www.netflix.com/watch/1", "netflix"],
    ["https://www.primevideo.com/detail/1", "primevideo"],
    ["https://www.disneyplus.com/video/1", "disneyplus"],
    ["https://play.max.com/video/1", "hbomax"],
    ["https://www.hulu.com/watch/1", "hulu"],
    ["https://www.coursera.org/learn/test", "coursera"],
    ["https://www.udemy.com/course/test", "udemy"],
    ["https://courses.edx.org/courses/test", "edx"],
    ["https://www.khanacademy.org/math", "khanacademy"],
    ["https://www.ted.com/talks/test", "ted"],
    ["https://vimeo.com/123", "vimeo"],
    ["https://www.linkedin.com/learning/test", "linkedin-learning"],
    ["https://www.bilibili.com/video/BV1", "bilibili"],
    ["https://x.com/i/spaces/1", "twitter"],
    ["https://www.facebook.com/watch/1", "facebook"],
    ["https://www.dailymotion.com/video/1", "dailymotion"],
  ])("matches %s with %s", (url, expected) => {
    expect(
      matchingSubtitleAdapters(url).map((adapter) => adapter.id),
    ).toContain(expected);
  });

  it("marks the best-effort streaming adapters experimental", () => {
    for (const url of [
      "https://www.disneyplus.com/video/1",
      "https://play.max.com/video/1",
      "https://www.hulu.com/watch/1",
    ]) {
      const adapter = matchingSubtitleAdapters(url).find(
        (candidate) => candidate.id !== "generic-track",
      );
      expect(adapter?.experimental).toBe(true);
    }
  });

  it("turns a captured network response into a cue source", () => {
    document.body.innerHTML = "<video></video>";
    const adapter = matchingSubtitleAdapters(
      "https://www.youtube.com/watch?v=1",
    ).find((candidate) => candidate.id === "youtube");
    const hub = new SubtitleCaptureHub();
    const listener = vi.fn();
    const unsubscribe = adapter
      ?.hook({ document, captures: hub })
      .subscribe(listener);
    hub.emit({
      adapterId: "youtube",
      format: "youtube-json3",
      url: "https://www.youtube.com/api/timedtext?fmt=json3",
      body: JSON.stringify({
        events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hello" }] }],
      }),
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterId: "youtube",
        cues: [{ id: "1", start: 0, end: 1, text: "Hello" }],
      }),
    );
    unsubscribe?.();
  });

  it("anchors Twitter Spaces captions to an audio timeline", () => {
    document.body.innerHTML = "<audio></audio>";
    const adapter = matchingSubtitleAdapters("https://x.com/i/spaces/1").find(
      (candidate) => candidate.id === "twitter",
    );
    const hub = new SubtitleCaptureHub();
    const listener = vi.fn();
    const unsubscribe = adapter
      ?.hook({ document, captures: hub })
      .subscribe(listener);
    hub.emit({
      adapterId: "twitter",
      format: "webvtt",
      url: "https://video.twimg.com/caption.vtt",
      body: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n",
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ media: document.querySelector("audio") }),
    );
    unsubscribe?.();
  });

  it("reads WebVTT-shaped TextTrack cues", () => {
    const cues = textTrackCues({
      cues: {
        0: { id: "a", startTime: 1, endTime: 2, text: "Hello" },
        length: 1,
      } as unknown as TextTrackCueList,
    });
    expect(cues).toEqual([{ id: "a", start: 1, end: 2, text: "Hello" }]);
  });

  it.each([
    ["netflix", "https://www.netflix.com/watch/1", "ttml", ttmlFixture],
    ["primevideo", "https://www.primevideo.com/detail/1", "ttml", ttmlFixture],
    ["disneyplus", "https://www.disneyplus.com/video/1", "auto", webVttFixture],
    ["hbomax", "https://play.max.com/video/1", "auto", webVttFixture],
    ["hulu", "https://www.hulu.com/watch/1", "auto", webVttFixture],
  ] as const)(
    "parses a captured streaming fixture for %s",
    (adapterId, pageUrl, format, body) => {
      expectCapturedFixture(adapterId, pageUrl, format, body);
    },
  );

  it.each([
    ["coursera", "https://www.coursera.org/learn/test"],
    ["udemy", "https://www.udemy.com/course/test"],
    ["edx", "https://courses.edx.org/courses/test"],
    ["khanacademy", "https://www.khanacademy.org/math"],
    ["ted", "https://www.ted.com/talks/test"],
    ["vimeo", "https://vimeo.com/123"],
    ["linkedin-learning", "https://www.linkedin.com/learning/test"],
  ] as const)(
    "parses a captured course fixture for %s",
    (adapterId, pageUrl) => {
      expectCapturedFixture(adapterId, pageUrl, "auto", webVttFixture);
    },
  );

  it.each([
    ["twitter", "https://x.com/i/spaces/1"],
    ["facebook", "https://www.facebook.com/watch/1"],
    ["dailymotion", "https://www.dailymotion.com/video/1"],
  ] as const)(
    "parses a captured social fixture for %s",
    (adapterId, pageUrl) => {
      expectCapturedFixture(adapterId, pageUrl, "auto", webVttFixture);
    },
  );

  it("parses a captured Bilibili JSON fixture", () => {
    expectCapturedFixture(
      "bilibili",
      "https://www.bilibili.com/video/BV1",
      "bilibili-json",
      bilibiliFixture,
    );
  });
});

function expectCapturedFixture(
  adapterId: string,
  pageUrl: string,
  format: SubtitleNetworkFormat,
  body: string,
): void {
  document.body.innerHTML = "<video></video>";
  const adapter = matchingSubtitleAdapters(pageUrl).find(
    (candidate) => candidate.id === adapterId,
  );
  const hub = new SubtitleCaptureHub();
  const listener = vi.fn();
  const unsubscribe = adapter
    ?.hook({ document, captures: hub })
    .subscribe(listener);

  hub.emit({
    adapterId,
    format,
    url: `https://media.example.test/${adapterId}/captions`,
    body,
  });

  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      adapterId,
      cues: expect.arrayContaining([
        expect.objectContaining({ start: 1.24, end: 3.88 }),
      ]),
    }),
  );
  unsubscribe?.();
}
