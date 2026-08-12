import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STAGES,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  STAGE_META,
  STAGE_PALETTE,
  StageKind,
  addStage,
  clampIterations,
  loopSummary,
  moveStage,
  placeStages,
  removeStage,
} from './loop-builder';

describe('loop builder model', () => {
  it('starts from the classic work → validate → reflect loop', () => {
    expect(DEFAULT_STAGES).toEqual([
      StageKind.WORK,
      StageKind.VALIDATE,
      StageKind.REFLECT,
    ]);
    expect(loopSummary(placeStages(DEFAULT_STAGES))).toBe(
      'work → validate → reflect',
    );
  });

  it('describes every palette stage', () => {
    for (const kind of STAGE_PALETTE) {
      const meta = STAGE_META[kind];
      expect(meta.label).toBeTruthy();
      expect(meta.glyph).toBeTruthy();
      expect(meta.hint).toBeTruthy();
    }
  });

  it('assigns stable, sequential ids when placing stages', () => {
    const placed = placeStages(DEFAULT_STAGES);
    expect(placed.map((s) => s.id)).toEqual([0, 1, 2]);
  });

  describe('addStage', () => {
    it('appends a stage with the given id', () => {
      const placed = placeStages(DEFAULT_STAGES);
      const next = addStage(placed, StageKind.SHIP, 3);
      expect(next).toHaveLength(4);
      expect(next[3]).toEqual({ id: 3, kind: StageKind.SHIP });
    });
  });

  describe('removeStage', () => {
    it('drops the stage with the matching id', () => {
      const placed = placeStages(DEFAULT_STAGES); // ids 0,1,2
      const next = removeStage(placed, 1);
      expect(next.map((s) => s.kind)).toEqual([
        StageKind.WORK,
        StageKind.REFLECT,
      ]);
    });
  });

  describe('moveStage', () => {
    it('swaps a stage one slot in the given direction', () => {
      const placed = placeStages(DEFAULT_STAGES); // work, validate, reflect
      const next = moveStage(placed, 1, -1); // validate moves earlier
      expect(next.map((s) => s.kind)).toEqual([
        StageKind.VALIDATE,
        StageKind.WORK,
        StageKind.REFLECT,
      ]);
    });

    it('is a no-op past either end', () => {
      const placed = placeStages(DEFAULT_STAGES);
      expect(moveStage(placed, 0, -1)).toBe(placed); // first can't go earlier
      expect(moveStage(placed, 2, 1)).toBe(placed); // last can't go later
    });

    it('ignores an unknown id', () => {
      const placed = placeStages(DEFAULT_STAGES);
      expect(moveStage(placed, 99, 1)).toBe(placed);
    });
  });

  describe('clampIterations', () => {
    it('bounds to the supported range and truncates', () => {
      expect(clampIterations(0)).toBe(MIN_ITERATIONS);
      expect(clampIterations(99)).toBe(MAX_ITERATIONS);
      expect(clampIterations(3.9)).toBe(3);
      expect(clampIterations(Number.NaN)).toBe(MIN_ITERATIONS);
    });
  });
});
