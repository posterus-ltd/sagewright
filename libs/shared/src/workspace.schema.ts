import { z } from 'zod';

import { mosaicNodeSchema, type MosaicNode } from './mosaic-node.schema';

/** Namespace prefix marking a leaf as an unfilled pane (a fresh split) rather than a real
 *  session. Kept as a constant so a slot id is never confused with a `sessionId` — the walker
 *  and the web placeholder both key off it. */
export const EMPTY_LEAF_PREFIX = 'empty:';

/** One named tiling layout: a binary tree of panes, each leaf holding a session id (or an
 *  `empty:*` slot). `tree` is `null` for a brand-new, empty workspace. */
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  tree: mosaicNodeSchema.nullable(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

/** A user's whole set of workspaces plus which one is currently open. Persisted as one JSON
 *  blob per user (mirrors `canvasLayoutSchema`). `activeWorkspaceId` is UI-only view state —
 *  it rides along in the blob but is excluded from the save signature client-side. */
export const workspacesSchema = z.object({
  workspaces: z.array(workspaceSchema),
  activeWorkspaceId: z.string().nullable(),
});
export type Workspaces = z.infer<typeof workspacesSchema>;

/** Served when a user has never built a workspace. */
export const EMPTY_WORKSPACES: Workspaces = {
  workspaces: [],
  activeWorkspaceId: null,
};

/** The GET response: the blob plus when it last changed. `updatedAt` lets the board detect an
 *  out-of-band rewrite (an agent's `set_workspaces`, or another tab) and re-seed live, without
 *  it being part of the PUT contract (clients save the bare `Workspaces` blob). Mirrors
 *  `canvasLayoutResponseSchema`. */
export const workspacesResponseSchema = workspacesSchema.extend({
  updatedAt: z.string().nullable(),
});
export type WorkspacesResponse = z.infer<typeof workspacesResponseSchema>;

/** Every REAL session id living in a tree (in-order), skipping `empty:*` slots. The single
 *  source of truth for "which sessions does this tree place" — used by the MCP owner-scoping
 *  check (server, across every workspace's tree) and the web `placedSessionIds` (per active
 *  workspace). Kept pure and dependency-free so both sides share one tree-walk. */
export const sessionLeafIds = (tree: MosaicNode | null): string[] => {
  const ids: string[] = [];
  const walk = (node: MosaicNode | null | undefined): void => {
    if (node == null) return;
    if (typeof node === 'string') {
      if (!node.startsWith(EMPTY_LEAF_PREFIX)) ids.push(node);
      return;
    }
    walk(node.first);
    walk(node.second);
  };
  walk(tree);
  return ids;
};
