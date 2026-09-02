/** Subscribe to SPA URL changes and return a cleanup function. */
export function onUrlChange(callback: (url: string) => void): () => void {
  // TODO(phase1:render): Patch history methods and subscribe to popstate.
  void callback;
  throw new Error("NotImplemented");
}
