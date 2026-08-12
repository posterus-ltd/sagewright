import { EMPTY_LEAF_PREFIX, type MosaicNode } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import {
  isEmptyLeaf,
  isLeaf,
  leafIds,
  newEmptyLeafId,
  pruneLeaves,
  removeLeaf,
  replaceLeaf,
  splitLeaf,
  treeSignature,
  workspacesSignature,
} from './workspace-mapping';

const grid: MosaicNode = {
  direction: 'row',
  first: 's1',
  second: { direction: 'column', first: 's2', second: 's3', splitPercentage: 60 },
  splitPercentage: 40,
};

describe('leaf predicates', () => {
  it('isLeaf distinguishes leaves from splits', () => {
    expect(isLeaf('s1')).toBe(true);
    expect(isLeaf(grid)).toBe(false);
  });

  it('isEmptyLeaf detects the empty:* sentinel', () => {
    expect(isEmptyLeaf(`${EMPTY_LEAF_PREFIX}x`)).toBe(true);
    expect(isEmptyLeaf('s1')).toBe(false);
  });

  it('newEmptyLeafId is prefixed and unique', () => {
    const a = newEmptyLeafId();
    const b = newEmptyLeafId();
    expect(a.startsWith(EMPTY_LEAF_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('leafIds', () => {
  it('lists every leaf in order', () => {
    expect(leafIds(grid)).toEqual(['s1', 's2', 's3']);
  });

  it('returns unique ids (no accidental duplication)', () => {
    const ids = leafIds(grid);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles a null tree and a bare leaf', () => {
    expect(leafIds(null)).toEqual([]);
    expect(leafIds('only')).toEqual(['only']);
  });
});

describe('replaceLeaf', () => {
  it('swaps a leaf in place, leaving the rest identical', () => {
    const next = replaceLeaf(grid, 's2', 'sX');
    expect(leafIds(next)).toEqual(['s1', 'sX', 's3']);
  });

  it('returns the same tree reference when the target is absent', () => {
    expect(replaceLeaf(grid, 'nope', 'sX')).toBe(grid);
  });
});

describe('splitLeaf', () => {
  it('inserts a new leaf beside the target as a row at 50%', () => {
    const next = splitLeaf('s1', 's1', 'row', 'empty:new');
    expect(next).toEqual({ direction: 'row', first: 's1', second: 'empty:new', splitPercentage: 50 });
  });

  it('splits a leaf inside a larger tree along a column', () => {
    const next = splitLeaf(grid, 's3', 'column', 'empty:n');
    expect(leafIds(next)).toEqual(['s1', 's2', 's3', 'empty:n']);
    // s3 was replaced by a column split { s3, empty:n }.
    const right = (next as Extract<MosaicNode, { direction: string }>).second as Extract<
      MosaicNode,
      { direction: string }
    >;
    const s3Node = right.second as Extract<MosaicNode, { direction: string }>;
    expect(s3Node).toEqual({ direction: 'column', first: 's3', second: 'empty:n', splitPercentage: 50 });
  });
});

describe('removeLeaf', () => {
  it('promotes the neighbor when a split collapses', () => {
    // Removing s2 leaves s3 alone in the right subtree, which promotes to just 's3'.
    const next = removeLeaf(grid, 's2');
    expect(next).toEqual({ direction: 'row', first: 's1', second: 's3', splitPercentage: 40 });
  });

  it('returns null when the last pane is removed', () => {
    expect(removeLeaf('solo', 'solo')).toBeNull();
  });

  it('leaves the tree untouched when the target is absent', () => {
    expect(removeLeaf(grid, 'ghost')).toBe(grid);
  });
});

describe('pruneLeaves', () => {
  it('drops session leaves not in the keep set, collapsing splits', () => {
    const next = pruneLeaves(grid, new Set(['s1', 's3']));
    expect(next).toEqual({ direction: 'row', first: 's1', second: 's3', splitPercentage: 40 });
  });

  it('never prunes empty:* slots', () => {
    const tree: MosaicNode = { direction: 'row', first: 's1', second: `${EMPTY_LEAF_PREFIX}a`, splitPercentage: 50 };
    const next = pruneLeaves(tree, new Set(['s1']));
    expect(next).toEqual(tree);
  });

  it('returns null when nothing survives', () => {
    expect(pruneLeaves('gone', new Set())).toBeNull();
  });
});

describe('treeSignature', () => {
  it('is stable across sub-integer splitPercentage drift', () => {
    const a: MosaicNode = { direction: 'row', first: 's1', second: 's2', splitPercentage: 50.2 };
    const b: MosaicNode = { direction: 'row', first: 's1', second: 's2', splitPercentage: 49.8 };
    expect(treeSignature(a)).toBe(treeSignature(b));
  });

  it('changes when structure changes', () => {
    expect(treeSignature('s1')).not.toBe(treeSignature(grid));
  });
});

describe('workspacesSignature', () => {
  it('is invariant to which workspace is active or zoomed (it takes only the array)', () => {
    const ws = [{ id: 'w1', name: 'A', tree: grid }];
    // The same workspaces array signs identically regardless of external active/zoom state.
    expect(workspacesSignature(ws)).toBe(workspacesSignature([{ ...ws[0]! }]));
  });

  it('reflects a rename or a tree change', () => {
    const base = [{ id: 'w1', name: 'A', tree: grid }];
    const renamed = [{ id: 'w1', name: 'B', tree: grid }];
    expect(workspacesSignature(base)).not.toBe(workspacesSignature(renamed));
  });
});
