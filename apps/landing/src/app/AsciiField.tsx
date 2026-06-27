import { useEffect, useRef, type FC } from 'react';

/**
 * A decorative, full-viewport ASCII glyph field that drifts slowly behind the
 * page content. Each grid cell's glyph and brightness are driven by a small
 * hand-rolled value-noise flow field, so the texture morphs like a slow
 * current. Purely cosmetic: it sits at `z-index: -1`, ignores pointer events,
 * and is hidden from assistive tech.
 *
 * Respects `prefers-reduced-motion` by painting a single static frame instead
 * of running an animation loop, and no-ops gracefully where the 2D canvas
 * context is unavailable (e.g. jsdom).
 */

/** Terminal-flavored glyphs, ordered roughly dim → dense. */
const GLYPHS = [
  '·',
  '.',
  ':',
  '-',
  '=',
  '+',
  '*',
  '/',
  '\\',
  '<',
  '>',
  '░',
  '▒',
];

const CELL_W = 15; // px between columns
const CELL_H = 19; // px between rows
const FONT_PX = 13;
const FRAME_MS = 1000 / 15; // throttle to ~15fps for a calm, cheap effect

/** Hash a lattice point to a pseudo-random value in [0, 1). */
const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 2D value noise in [0, 1), bilinearly interpolated between lattice hashes. */
const noise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const top = lerp(hash(xi, yi), hash(xi + 1, yi), u);
  const bottom = lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u);
  return lerp(top, bottom, v);
};

export const AsciiField: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return; // unsupported environment — render nothing, no throw
    const context = ctx;

    let accent = '#f97316';
    let muted = '#7d8590';
    const readColors = () => {
      const styles = getComputedStyle(document.documentElement);
      accent = styles.getPropertyValue('--accent').trim() || accent;
      muted = styles.getPropertyValue('--muted').trim() || muted;
    };
    readColors();

    // Re-read the palette when the visitor toggles theme (data-theme on <html>)
    // or the OS scheme flips, so the field tracks the rest of the page.
    const watchTheme = (onChange: () => void): (() => void) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
      const scheme = window.matchMedia?.('(prefers-color-scheme: light)');
      scheme?.addEventListener('change', onChange);
      return () => {
        observer.disconnect();
        scheme?.removeEventListener('change', onChange);
      };
    };

    let cols = 0;
    let rows = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      // Work in CSS pixels regardless of device pixel ratio.
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = `${FONT_PX}px ui-monospace, monospace`;
      context.textBaseline = 'top';
      cols = Math.ceil(w / CELL_W) + 1;
      rows = Math.ceil(h / CELL_H) + 1;
    };

    const drawFrame = (timeMs: number) => {
      const t = timeMs * 0.00006; // slow drift
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Drift the sample point diagonally over time → flowing currents.
          const n = noise(col * 0.18 + t, row * 0.18 - t * 0.6);
          if (n < 0.32) continue; // leave the troughs empty → breathing room
          // The index is clamped to a valid slot, so the lookup is never
          // undefined; the `?? '·'` only satisfies noUncheckedIndexedAccess.
          const glyph =
            GLYPHS[Math.min(GLYPHS.length - 1, (n * GLYPHS.length) | 0)] ?? '·';
          const bright = n > 0.82;
          context.fillStyle = bright ? accent : muted;
          context.globalAlpha = bright
            ? 0.32 + (n - 0.82) * 2
            : 0.05 + n * 0.09;
          context.shadowBlur = bright ? 8 : 0;
          context.shadowColor = bright ? accent : 'transparent';
          context.fillText(glyph, col * CELL_W, row * CELL_H);
        }
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    };

    resize();

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (prefersReducedMotion) {
      drawFrame(0);
      const onResizeStatic = () => {
        resize();
        drawFrame(0);
      };
      window.addEventListener('resize', onResizeStatic);
      const stopThemeWatch = watchTheme(() => {
        readColors();
        drawFrame(0);
      });
      return () => {
        window.removeEventListener('resize', onResizeStatic);
        stopThemeWatch();
      };
    }

    let rafId = 0;
    let last = 0;
    const loop = (now: number) => {
      rafId = window.requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      drawFrame(now);
    };
    rafId = window.requestAnimationFrame(loop);

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    };
    window.addEventListener('resize', onResize);

    // The render loop repaints every frame, so the watcher only refreshes the
    // cached colors — the next frame picks them up.
    const stopThemeWatch = watchTheme(readColors);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      stopThemeWatch();
    };
  }, []);

  return <canvas ref={canvasRef} className="ascii-field" aria-hidden="true" />;
};
