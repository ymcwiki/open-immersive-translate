import { afterEach, describe, expect, it, vi } from "vitest";

import { observeMutations } from "../../src/content/observe/mutation";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("observeMutations", () => {
  it("ignores extension nodes and debounces ordinary additions", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "<main></main>";
    const root = document.querySelector("main")!;
    const onChanged = vi.fn();
    const stop = observeMutations(root, onChanged, { debounceMs: 100 });

    const ownNode = document.createElement("font");
    ownNode.dataset.imt = "target";
    root.append(ownNode);
    ownNode.append("ignored");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(onChanged).not.toHaveBeenCalled();

    const first = document.createElement("p");
    const second = document.createElement("p");
    root.append(first);
    root.append(second);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(99);
    expect(onChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledWith([first, second]);

    stop();
  });

  it("ignores configured subtrees and character changes inside extension nodes", async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      "<main><section class='ticker'>old</section><font data-imt='target'>old</font><p>old</p></main>";
    const root = document.querySelector("main")!;
    const onChanged = vi.fn();
    const stop = observeMutations(root, onChanged, {
      debounceMs: 100,
      excludeSelectors: [".ticker"],
    });

    document.querySelector(".ticker")!.firstChild!.textContent = "new";
    document.querySelector('[data-imt="target"]')!.firstChild!.textContent =
      "new";
    const sourceText = document.querySelector("p")!.firstChild!;
    sourceText.textContent = "new";
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(onChanged).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledWith([sourceText]);
    stop();
  });

  it("coalesces a changed subtree to its highest pending node", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "<main></main>";
    const root = document.querySelector("main")!;
    const onChanged = vi.fn();
    const stop = observeMutations(root, onChanged);
    const parent = document.createElement("section");
    const child = document.createElement("p");

    root.append(parent);
    parent.append(child);
    child.append("new");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(onChanged).toHaveBeenCalledWith([parent]);
    stop();
  });
});
