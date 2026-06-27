import type { CanvasLayout, CanvasViewport, SessionPlacement } from '@sagewright/shared';
import type { Node } from '@xyflow/react';

import type { SessionNodeData } from './canvas-actions';

export const DEFAULT_WIDTH = 800;
export const DEFAULT_HEIGHT = 600;

/** A saved placement → a React Flow node, defaulting size and carrying border color. */
export const placementToNode = (p: SessionPlacement): Node<SessionNodeData> => ({
  id: p.sessionId,
  type: 'session',
  position: { x: p.x, y: p.y },
  width: p.width ?? DEFAULT_WIDTH,
  height: p.height ?? DEFAULT_HEIGHT,
  data: { sessionId: p.sessionId, borderColor: p.borderColor },
});

/** Current nodes + viewport → the persistable layout, including per-widget border color. */
export const buildLayout = (nodes: Node<SessionNodeData>[], viewport: CanvasViewport): CanvasLayout => ({
  placements: nodes.map((n) => ({
    sessionId: n.id,
    x: n.position.x,
    y: n.position.y,
    width: n.width ?? undefined,
    height: n.height ?? undefined,
    borderColor: n.data.borderColor,
  })),
  viewport,
});
