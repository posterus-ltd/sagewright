import AddRounded from '@mui/icons-material/AddRounded';
import { Box, Button, Typography, useTheme } from '@mui/material';
import type { MosaicNode } from '@sagewright/shared';
import { type FC, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { MosaicPane } from './MosaicPane';
import { isLeaf } from './workspace-mapping';

type Branch = 'first' | 'second';

/** Set the `splitPercentage` of the split node at `path` (a list of first/second turns),
 *  returning a new tree. Structure is untouched — only the divider position changes. */
const setSplitAt = (node: MosaicNode, path: Branch[], pct: number): MosaicNode => {
  if (isLeaf(node)) return node;
  if (path.length === 0) return { ...node, splitPercentage: pct };
  const [head, ...rest] = path;
  return head === 'first'
    ? { ...node, first: setSplitAt(node.first, rest, pct) }
    : { ...node, second: setSplitAt(node.second, rest, pct) };
};

/** A key that changes only when the tree's SHAPE changes (leaf ids + directions), never when a
 *  `splitPercentage` drifts. Used as the React key on each subtree so a split/remove remounts
 *  just the affected panes — untouched panes keep their live terminals — while a divider drag
 *  never remounts anything. */
const structureKey = (node: MosaicNode): string =>
  isLeaf(node) ? node : `${node.direction}(${structureKey(node.first)},${structureKey(node.second)})`;

interface WorkspaceMosaicProps {
  tree: MosaicNode | null;
  /** When set (and a real leaf), the mosaic renders just that pane filling the frame. */
  zoomedLeafId: string | null;
  /** A divider drag settled on new sizes — persist the updated `splitPercentage`. */
  onTreeChange: (tree: MosaicNode) => void;
  /** True while a divider is being dragged, so the board can block live reconcile. */
  onDraggingChange: (dragging: boolean) => void;
  /** The empty-workspace zero state's action: create the first pane. */
  onAddPane: () => void;
}

export const WorkspaceMosaic: FC<WorkspaceMosaicProps> = ({
  tree,
  zoomedLeafId,
  onTreeChange,
  onDraggingChange,
  onAddPane,
}) => {
  const theme = useTheme();

  const renderNode = (node: MosaicNode, path: Branch[]): ReactNode => {
    if (isLeaf(node)) return <MosaicPane leafId={node} />;
    const direction = node.direction === 'row' ? 'horizontal' : 'vertical';
    const firstSize = node.splitPercentage ?? 50;
    return (
      <PanelGroup
        direction={direction}
        onLayout={(sizes) => {
          if (sizes.length !== 2) return;
          // Skip the mount echo and sub-integer drift so a load never triggers a spurious save.
          if (Math.round(sizes[0]!) === Math.round(node.splitPercentage ?? 50)) return;
          // `renderNode` only runs on the non-null branch below, so `tree` is a real node here.
          onTreeChange(setSplitAt(tree as MosaicNode, path, sizes[0]!));
        }}
        style={{ display: 'flex', height: '100%', width: '100%' }}
      >
        <Panel
          key={structureKey(node.first)}
          defaultSize={firstSize}
          minSize={10}
          style={{ display: 'flex', minWidth: 0, minHeight: 0 }}
        >
          {renderNode(node.first, [...path, 'first'])}
        </Panel>
        <PanelResizeHandle
          onDragging={onDraggingChange}
          style={{
            flex: '0 0 6px',
            background: theme.palette.divider,
            transition: 'background 120ms',
          }}
        />
        <Panel
          key={structureKey(node.second)}
          defaultSize={100 - firstSize}
          minSize={10}
          style={{ display: 'flex', minWidth: 0, minHeight: 0 }}
        >
          {renderNode(node.second, [...path, 'second'])}
        </Panel>
      </PanelGroup>
    );
  };

  // Zoom (tmux prefix+z): a single leaf fills the frame. Only honored for a real, present leaf.
  if (zoomedLeafId) {
    return (
      <Box sx={{ width: '100%', height: '100%' }}>
        <MosaicPane leafId={zoomedLeafId} />
      </Box>
    );
  }

  // Empty workspace — no panes yet (or the last one was removed).
  if (tree == null) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">This workspace has no panes.</Typography>
        <Button variant="outlined" startIcon={<AddRounded />} onClick={onAddPane}>
          Add a pane
        </Button>
      </Box>
    );
  }

  return (
    // Keying the root by structure remounts panes only when the shape changes; a divider drag
    // (percentage-only) keeps the same key, so terminals never reconnect on resize.
    <Box key={structureKey(tree)} sx={{ width: '100%', height: '100%' }}>
      {renderNode(tree, [])}
    </Box>
  );
};
