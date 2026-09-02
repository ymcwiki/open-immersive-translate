import { afterAll, describe, expect, it } from "vitest";

import {
  installYouTubeMainInterceptor,
  isYouTubeTimedTextUrl,
} from "../../src/content/features/youtube-main";

const dispose = installYouTubeMainInterceptor();

afterAll(() => dispose());

describe("YouTube MAIN-world interception", () => {
  it("matches only YouTube timed-text URLs", () => {
    expect(
      isYouTubeTimedTextUrl(
        "https://www.youtube.com/api/timedtext?v=123",
        "https://www.youtube.com/watch?v=123",
      ),
    ).toBe(true);
    expect(
      isYouTubeTimedTextUrl(
        "https://example.com/api/timedtext?v=123",
        "https://www.youtube.com/watch?v=123",
      ),
    ).toBe(false);
    expect(
      isYouTubeTimedTextUrl(
        "/watch?v=123",
        "https://www.youtube.com/watch?v=123",
      ),
    ).toBe(false);
  });
});
