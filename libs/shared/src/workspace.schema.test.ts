import { describe, expect, it } from 'vitest';

import {
  EMPTY_LEAF_PREFIX,
  EMPTY_WORKSPACES,
  mosaicNodeSchema,
  sessionLeafIds,
  workspaceSchema,
  workspacesSchema,
  type MosaicNode,
} from './index';

const tree: MosaicNode = {
  direction: 'row',
  first: 's1',
  second: {
    direction: 'column',
    first: 's2',
    second: `${EMPTY_LEAF_PREFIX}abc`,
    splitPercentage: 60,
  },
  splitPercentage: 40,
};

describe('mosaicNodeSchema', () => {
  it('round-trips a nested split tree', () => {
    expect(mosaicNodeSchema.parse(tree)).toEqual(tree);
  });

  it('accepts a bare leaf string', () => {
    expect(mosaicNodeSchema.parse('s1')).toBe('s1');
  });

  it('rejects an unknown direction', () => {
    expect(() =>
      mosaicNodeSchema.parse({ direction: 'diagonal', first: 'a', second: 'b' }),
    ).toThrow();
  });
});

describe('workspaceSchema', () => {
  it('round-trips a workspace with a tree', () => {
    const ws = { id: 'w1', name: 'Reviews', tree };
    expect(workspaceSchema.parse(ws)).toEqual(ws);
  });

  it('accepts a null tree (empty workspace)', () => {
    const ws = { id: 'w1', name: 'Empty', tree: null };
    expect(workspaceSchema.parse(ws)).toEqual(ws);
  });

  it('rejects a name over 120 chars', () => {
    expect(() => workspaceSchema.parse({ id: 'w1', name: 'x'.repeat(121), tree: null })).toThrow();
  });
});

describe('workspacesSchema', () => {
  it('accepts the empty default', () => {
    expect(workspacesSchema.parse(EMPTY_WORKSPACES)).toEqual(EMPTY_WORKSPACES);
  });
});

describe('sessionLeafIds', () => {
  it('returns real session leaves in order, skipping empty:* slots', () => {
    expect(sessionLeafIds(tree)).toEqual(['s1', 's2']);
  });

  it('returns [] for a null tree', () => {
    expect(sessionLeafIds(null)).toEqual([]);
  });

  it('treats a bare session leaf as one id', () => {
    expect(sessionLeafIds('s9')).toEqual(['s9']);
  });

  it('returns [] for a lone empty slot', () => {
    expect(sessionLeafIds(`${EMPTY_LEAF_PREFIX}z`)).toEqual([]);
  });
});
