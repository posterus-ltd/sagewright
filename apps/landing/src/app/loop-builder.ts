/**
 * Model for the interactive loop builder on the landing page.
 *
 * The real control plane lets anyone define a custom self-correcting loop — an
 * ordered pipeline of stages an agent runs, retrying up to a cap before it
 * escalates to a human. This module is the framework-free core of the little
 * builder that showcases that: an ordered list of {@link LoopStage}s plus an
 * iteration cap, with pure helpers to add, remove, and reorder stages. Kept
 * pure so it is unit-testable; the React state lives in {@link LoopBuilder}.
 */

/** A stage an agent can run inside a loop, mirroring the built-in phases. */
export enum StageKind {
  WORK = 'work',
  VALIDATE = 'validate',
  REFLECT = 'reflect',
  REVIEW = 'review',
  SHIP = 'ship',
}

export interface StageMeta {
  readonly kind: StageKind;
  /** Terminal glyph shown in the stage box and palette. */
  readonly glyph: string;
  readonly label: string;
  /** One-line description of what the stage does. */
  readonly hint: string;
  /**
   * A decorative accent for the stage box. Deliberately literal hexes (not
   * theme tokens): mid-tone terminal hues that read on both the light and dark
   * surface. Mirrors the control plane's per-widget palette.
   */
  readonly color: string;
}

export const STAGE_META: Record<StageKind, StageMeta> = {
  [StageKind.WORK]: {
    kind: StageKind.WORK,
    glyph: '▶',
    label: 'work',
    hint: 'read the repo & make the change',
    color: '#f97316',
  },
  [StageKind.VALIDATE]: {
    kind: StageKind.VALIDATE,
    glyph: '✓',
    label: 'validate',
    hint: 'run the tests, types & checks',
    color: '#3fb950',
  },
  [StageKind.REFLECT]: {
    kind: StageKind.REFLECT,
    glyph: '↻',
    label: 'reflect',
    hint: 'diagnose failures & patch',
    color: '#a371f7',
  },
  [StageKind.REVIEW]: {
    kind: StageKind.REVIEW,
    glyph: '◎',
    label: 'review',
    hint: 'self-review the diff',
    color: '#58a6ff',
  },
  [StageKind.SHIP]: {
    kind: StageKind.SHIP,
    glyph: '⇧',
    label: 'ship',
    hint: 'commit · push · open a PR',
    color: '#d29922',
  },
};

/** The order stages appear in as "add stage" buttons. */
export const STAGE_PALETTE: readonly StageKind[] = [
  StageKind.WORK,
  StageKind.VALIDATE,
  StageKind.REFLECT,
  StageKind.REVIEW,
  StageKind.SHIP,
];

/** The classic core loop — work → validate → reflect — offered as the start. */
export const DEFAULT_STAGES: readonly StageKind[] = [
  StageKind.WORK,
  StageKind.VALIDATE,
  StageKind.REFLECT,
];

export const MIN_ITERATIONS = 1;
export const MAX_ITERATIONS = 5;
export const DEFAULT_ITERATIONS = 3;

/** One placed stage. `id` is stable so React keys and reorders survive edits. */
export interface LoopStage {
  readonly id: number;
  readonly kind: StageKind;
}

/** Turn a list of kinds into placed stages with sequential ids from `0`. */
export const placeStages = (kinds: readonly StageKind[]): LoopStage[] =>
  kinds.map((kind, id) => ({ id, kind }));

/** Append a stage; the caller supplies the next unique id. */
export const addStage = (
  stages: readonly LoopStage[],
  kind: StageKind,
  id: number,
): LoopStage[] => [...stages, { id, kind }];

export const removeStage = (
  stages: readonly LoopStage[],
  id: number,
): LoopStage[] => stages.filter((stage) => stage.id !== id);

/**
 * Move the stage with `id` one slot left (`-1`) or right (`+1`). A move that
 * would fall off either end is a no-op and returns the list unchanged.
 */
export const moveStage = (
  stages: readonly LoopStage[],
  id: number,
  dir: -1 | 1,
): readonly LoopStage[] => {
  const from = stages.findIndex((stage) => stage.id === id);
  if (from < 0) return stages;
  const to = from + dir;
  if (to < 0 || to >= stages.length) return stages; // already at an end
  const next = [...stages];
  const moved = next[from]!;
  next[from] = next[to]!;
  next[to] = moved;
  return next;
};

/** Clamp an iteration count into the supported range, rejecting non-integers. */
export const clampIterations = (value: number): number => {
  if (!Number.isFinite(value)) return MIN_ITERATIONS;
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.trunc(value)));
};

/** A readable one-liner of the loop, e.g. `work → validate → reflect`. */
export const loopSummary = (stages: readonly LoopStage[]): string =>
  stages.map((stage) => STAGE_META[stage.kind].label).join(' → ');
