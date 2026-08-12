import { z } from 'zod';

/** A split's axis. `row` lays its two children out side-by-side (a vertical divider you
 *  drag left/right); `column` stacks them (a horizontal divider you drag up/down). Named
 *  to match the tiling library's `MosaicNode` so the persisted tree maps 1:1 onto it. */
export type MosaicDirection = 'row' | 'column';

/**
 * A binary layout tree, persisted verbatim as a workspace's `tree`. A **leaf** is a plain
 * string — a real `sessionId`, or an `empty:<id>` sentinel for a freshly split, not-yet-filled
 * pane (see `EMPTY_LEAF_PREFIX` in `workspace.schema.ts`). A **split** node holds two children
 * and a `splitPercentage` (the first child's share, 0–100). This mirrors react-mosaic's
 * classic `MosaicNode<string>` shape, which is our storage format regardless of which renderer
 * draws it — so a switch of tiling library never touches the schema or any tree helper.
 */
export type MosaicNode =
  | string
  | {
      direction: MosaicDirection;
      first: MosaicNode;
      second: MosaicNode;
      splitPercentage?: number;
    };

/** Recursive Zod schema for `MosaicNode`. `z.lazy` ties the knot for the self-reference;
 *  the explicit `z.ZodType<MosaicNode>` annotation gives the union a concrete type. */
export const mosaicNodeSchema: z.ZodType<MosaicNode> = z.lazy(() =>
  z.union([
    z.string(),
    z.object({
      direction: z.enum(['row', 'column']),
      first: mosaicNodeSchema,
      second: mosaicNodeSchema,
      splitPercentage: z.number().optional(),
    }),
  ]),
);
