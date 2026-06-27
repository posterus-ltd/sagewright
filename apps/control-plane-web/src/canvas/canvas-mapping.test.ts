import type { SessionPlacement } from '@sagewright/shared';
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildLayout, DEFAULT_HEIGHT, DEFAULT_WIDTH, placementToNode } from './canvas-mapping';
import type { SessionNodeData } from './canvas-actions';

describe('placementToNode', () => {
  it('carries the border color into node data', () => {
    const node = placementToNode({ sessionId: 'a', x: 1, y: 2, borderColor: '#3fb950' });
    expect(node.data.borderColor).toBe('#3fb950');
  });

  it('defaults width and height when the placement omits them', () => {
    const node = placementToNode({ sessionId: 'a', x: 1, y: 2 });
    expect(node.width).toBe(DEFAULT_WIDTH);
    expect(node.height).toBe(DEFAULT_HEIGHT);
    expect(node.data.borderColor).toBeUndefined();
  });
});

describe('buildLayout', () => {
  const viewport = { x: 0, y: 0, zoom: 1 };

  it('copies the node border color back into the placement', () => {
    const node: Node<SessionNodeData> = {
      id: 'a',
      type: 'session',
      position: { x: 5, y: 6 },
      width: 400,
      height: 300,
      data: { sessionId: 'a', borderColor: '#58a6ff' },
    };
    expect(buildLayout([node], viewport).placements[0]).toEqual({
      sessionId: 'a',
      x: 5,
      y: 6,
      width: 400,
      height: 300,
      borderColor: '#58a6ff',
    });
  });

  it('round-trips a placement through node and back, preserving border color', () => {
    const placement: SessionPlacement = { sessionId: 'a', x: 1, y: 2, width: 400, height: 300, borderColor: '#f97316' };
    const [out] = buildLayout([placementToNode(placement)], viewport).placements;
    expect(out).toEqual(placement);
  });
});
