import {
  EMPTY_LEAF_PREFIX,
  type MosaicDirection,
  type MosaicNode,
  type Workspace,
} from '@sagewright/shared';

export { EMPTY_LEAF_PREFIX };

/**
 * Pure, library-agnostic helpers over the persisted `MosaicNode` tree. Nothing here
 * imports a renderer, so swapping the tiling library (react-resizable-panels today,
 * react-mosaic later) never touches this file — only `WorkspaceMosaic`/`MosaicPane` do.
 * A leaf is a plain string: a real `sessionId`, or an `empty:*` sentinel for an unfilled
 * pane. Every mutator returns a NEW tree (immutable) and preserves node identity where a
 * subtree is unchanged, so React can skip re-rendering untouched panes.
 */

/** A leaf is a plain string (a session id or an `empty:*` slot); a split is an object. */
export const isLeaf = (node: MosaicNode): node is string => typeof node === 'string';

/** True for the `empty:*` sentinel of a freshly split, not-yet-filled pane. */
export const isEmptyLeaf = (node: MosaicNode): node is string =>
  typeof node === 'string' && node.startsWith(EMPTY_LEAF_PREFIX);

/** A fresh, unique id for an unfilled pane. `crypto.randomUUID` keeps it collision-free
 *  without pulling in a nanoid dependency (available in every browser + jsdom/Node ≥ 19). */
export const newEmptyLeafId = (): string => `${EMPTY_LEAF_PREFIX}${crypto.randomUUID()}`;

/** Every leaf id in the tree (sessions AND empty slots), in left-to-right order. */
export const leafIds = (tree: MosaicNode | null): string[] => {
  const ids: string[] = [];
  const walk = (node: MosaicNode | null): void => {
    if (node == null) return;
    if (isLeaf(node)) {
      ids.push(node);
      return;
    }
    walk(node.first);
    walk(node.second);
  };
  walk(tree);
  return ids;
};

/** Replace every occurrence of the leaf `target` with `next`. Returns a new tree. */
export const replaceLeaf = (tree: MosaicNode, target: string, next: MosaicNode): MosaicNode => {
  if (isLeaf(tree)) return tree === target ? next : tree;
  const first = replaceLeaf(tree.first, target, next);
  const second = replaceLeaf(tree.second, target, next);
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
};

/**
 * Split the leaf `target` in two: it becomes the `first` child and `newLeaf` the `second`,
 * laid out along `direction` at a 50/50 split. This is the native tmux `prefix+"` / `prefix+%`
 * — the new leaf is an `empty:*` slot the user then fills.
 */
export const splitLeaf = (
  tree: MosaicNode,
  target: string,
  direction: MosaicDirection,
  newLeaf: string,
): MosaicNode =>
  replaceLeaf(tree, target, {
    direction,
    first: target,
    second: newLeaf,
    splitPercentage: 50,
  });

/**
 * Remove the leaf `target`, collapsing its parent split and promoting the sibling into the
 * split's place (the parent's `splitPercentage` is dropped). Returns `null` when the tree was
 * just that leaf (removing the last pane empties the workspace).
 */
export const removeLeaf = (tree: MosaicNode, target: string): MosaicNode | null => {
  if (isLeaf(tree)) return tree === target ? null : tree;
  const first = removeLeaf(tree.first, target);
  const second = removeLeaf(tree.second, target);
  if (first == null) return second; // this side collapsed → promote the neighbor
  if (second == null) return first;
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
};

/**
 * Drop every session leaf whose id isn't in `keep` (e.g. an archived session), collapsing the
 * splits above it. `empty:*` slots are always kept — an unfilled pane isn't a stale session.
 * Returns `null` if nothing survives.
 */
export const pruneLeaves = (tree: MosaicNode | null, keep: Set<string>): MosaicNode | null => {
  if (tree == null) return null;
  if (isLeaf(tree)) {
    if (isEmptyLeaf(tree)) return tree;
    return keep.has(tree) ? tree : null;
  }
  const first = pruneLeaves(tree.first, keep);
  const second = pruneLeaves(tree.second, keep);
  if (first == null) return second;
  if (second == null) return first;
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
};

/**
 * A stable fingerprint of a tree's structure, with `splitPercentage` rounded so a sub-pixel
 * divider drift never reads as a change worth saving/re-seeding. Two trees with the same shape
 * and (rounded) splits produce the same string.
 */
export const treeSignature = (tree: MosaicNode | null): string => {
  const norm = (node: MosaicNode | null): unknown => {
    if (node == null) return null;
    if (isLeaf(node)) return node;
    return {
      d: node.direction,
      s: node.splitPercentage == null ? null : Math.round(node.splitPercentage),
      f: norm(node.first),
      x: norm(node.second),
    };
  };
  return JSON.stringify(norm(tree));
};

/**
 * A stable fingerprint of the whole workspaces array (id + name + tree shape). Deliberately
 * EXCLUDES `activeWorkspaceId` and any zoom state, so switching the open tab — here or in
 * another tab — never forces a mid-edit re-seed. The `placementsSignature` analogue.
 */
export const workspacesSignature = (workspaces: Workspace[]): string =>
  JSON.stringify(
    workspaces.map((w) => ({ id: w.id, name: w.name, t: treeSignature(w.tree) })),
  );
