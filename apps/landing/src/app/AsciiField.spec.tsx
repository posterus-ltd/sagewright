import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AsciiField } from './AsciiField';

/**
 * A throwaway stand-in for CanvasRenderingContext2D. jsdom does not implement
 * the 2D context, so we mock getContext for every test and capture the draw
 * calls the component makes.
 */
const makeCtx = () => ({
  setTransform: vi.fn(),
  scale: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 8 })),
  fillStyle: '',
  font: '',
  globalAlpha: 1,
  textBaseline: 'top',
  shadowBlur: 0,
  shadowColor: '',
});

const stubReducedMotion = (matches: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
};

describe('AsciiField', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a decorative canvas marked aria-hidden', () => {
    const { container } = render(<AsciiField />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
  });

  it('mounts and unmounts without throwing when no 2D context is available', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const raf = vi.spyOn(window, 'requestAnimationFrame');

    const { unmount } = render(<AsciiField />);
    expect(() => unmount()).not.toThrow();
    expect(raf).not.toHaveBeenCalled();
  });

  it('draws a single static frame without an animation loop under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');

    render(<AsciiField />);

    expect(ctx.fillText).toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  });

  it('starts an animation loop when motion is allowed', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockReturnValue(0 as unknown as number);

    render(<AsciiField />);

    expect(raf).toHaveBeenCalled();
  });
});
