import { describe, expect, it } from 'vitest';
import { canvasLayoutSchema, EMPTY_CANVAS_LAYOUT } from './index';

describe('canvasLayoutSchema', () => {
  it('round-trips a layout with placements and viewport', () => {
    const layout = {
      placements: [
        { sessionId: 'a', x: 10, y: 20 },
        { sessionId: 'b', x: 0, y: 0, width: 400, height: 300 },
      ],
      viewport: { x: -5, y: 12, zoom: 1.5 },
    };
    expect(canvasLayoutSchema.parse(layout)).toEqual(layout);
  });

  it('round-trips a placement with a border color', () => {
    const layout = {
      placements: [{ sessionId: 'a', x: 10, y: 20, borderColor: '#3fb950' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    expect(canvasLayoutSchema.parse(layout)).toEqual(layout);
  });

  it('accepts the empty default', () => {
    expect(canvasLayoutSchema.parse(EMPTY_CANVAS_LAYOUT)).toEqual(EMPTY_CANVAS_LAYOUT);
  });

  it('rejects a placement missing coordinates', () => {
    expect(() =>
      canvasLayoutSchema.parse({ placements: [{ sessionId: 'a' }], viewport: { x: 0, y: 0, zoom: 1 } }),
    ).toThrow();
  });
});
