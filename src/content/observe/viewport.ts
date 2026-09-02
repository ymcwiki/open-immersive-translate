/** Start lazy visibility observation and return a cleanup function. */
export function observeViewport(
  elements: readonly Element[],
  onVisible: (element: Element) => void,
): () => void {
  // TODO(phase1:render): Implement rootMargin-based IntersectionObserver logic.
  void elements;
  void onVisible;
  throw new Error("NotImplemented");
}
