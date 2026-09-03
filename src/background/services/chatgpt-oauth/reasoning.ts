import type { ReasoningEffort } from "../../../shared/types";

/** Low-to-high order used when a model rejects a requested effort. */
export const EFFORT_LADDER = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ReasoningEffort[];

const LEGACY_EFFORTS = EFFORT_LADDER.slice(0, -1);

/** Return the reasoning vocabulary accepted by a Codex Responses model. */
export function supportedEfforts(
  model: string | undefined,
): readonly ReasoningEffort[] {
  return model?.toLowerCase().includes("gpt-5.6")
    ? EFFORT_LADDER
    : LEGACY_EFFORTS;
}

/** Keep a supported level, otherwise use the nearest weaker supported level. */
export function clampEffort(
  level: ReasoningEffort,
  model: string | undefined,
): ReasoningEffort {
  const supported = supportedEfforts(model);
  if (supported.includes(level)) return level;

  const requestedIndex = EFFORT_LADDER.indexOf(level);
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = EFFORT_LADDER[index];
    if (candidate && supported.includes(candidate)) return candidate;
  }
  return supported[0] ?? "none";
}
