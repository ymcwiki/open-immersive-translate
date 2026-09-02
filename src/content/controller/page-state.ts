import type { PageTranslationState } from "../../shared/j-types";

export interface PageCounts {
  active: boolean;
  total: number;
  pending: number;
  translated: number;
  errors: number;
}

export function pageTranslationState(counts: PageCounts): PageTranslationState {
  let status: PageTranslationState["status"] = "idle";
  if (
    counts.active &&
    (counts.pending > 0 || counts.translated + counts.errors < counts.total)
  ) status = "translating";
  else if (counts.active && counts.errors > 0) status = "error";
  else if (counts.active) status = "done";
  return {
    status,
    total: counts.total,
    pending: counts.pending,
    translated: counts.translated,
    errors: counts.errors,
  };
}

export function mergePageStates(
  own: PageTranslationState,
  frames: Iterable<PageTranslationState>,
): PageTranslationState {
  const states = [own, ...frames];
  const totals = states.reduce(
    (sum, state) => ({
      total: sum.total + state.total,
      pending: sum.pending + state.pending,
      translated: sum.translated + state.translated,
      errors: sum.errors + state.errors,
    }),
    { total: 0, pending: 0, translated: 0, errors: 0 },
  );
  const status = totals.pending > 0
    ? "translating"
    : totals.errors > 0
      ? "error"
      : states.some((state) => state.status !== "idle")
        ? "done"
        : "idle";
  return { status, ...totals };
}
