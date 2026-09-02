import type { Rule } from "../../shared/types";

/** Observe relevant DOM additions and return a cleanup function. */
export function observeMutations(
  root: Node,
  rule: Rule,
  onChanged: (nodes: readonly Node[]) => void,
): () => void {
  // TODO(phase1:render): Add debounced mutation filtering.
  void root;
  void rule;
  void onChanged;
  throw new Error("NotImplemented");
}
