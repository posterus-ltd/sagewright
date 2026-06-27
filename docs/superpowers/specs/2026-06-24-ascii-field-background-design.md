# Animated ASCII Background — Landing Page

**Date:** 2026-06-24
**Surface:** `apps/landing` (the public landing page; not the MUI-based control-plane About page)

## Goal

Add a subtle, modern, animated ASCII character field behind the landing page
content. It should read as atmospheric and on-brand with the existing terminal
aesthetic, never fighting the foreground text for attention.

## Approach

A single `<canvas>` rendered as a fixed, full-viewport layer behind all content,
animated by a dependency-free value-noise flow field. Chosen over Matrix rain
(too busy / cliché) and a wave-ripple effect (less ambient).

## Component

New component `apps/landing/src/app/AsciiField.tsx`:

- Renders one `<canvas>` element.
- Mounts as the **first child of `LandingPage`**, so existing `.page` content
  stacks above it.
- `aria-hidden="true"` — purely decorative.
- CSS class `.ascii-field`: `position: fixed; inset: 0; z-index: -1;
  pointer-events: none;` (rule added to `apps/landing/src/styles.css`).

## The effect

- A coarse monospace grid of cells covering the viewport.
- Each cell's glyph and brightness are driven by a cheap, hand-rolled
  value-noise function sampled at `(col, row, time)`.
- Glyphs are drawn from a small terminal-flavored set, e.g.
  `. : - = + * / \ < > ▒ ░`. The noise value selects the glyph, so the field
  slowly morphs.
- Most cells render very dim; noise crests push a few cells to brighter
  matrix-green with a soft glow, creating gentle drifting "currents."
- The field drifts diagonally over time — slow and ambient.
- Colors pull from CSS custom properties (`--bg`, `--accent`, `--muted`) so the
  layer tracks the theme. Windows keep their solid `--surface` fill, so
  foreground text stays fully readable above the layer.

## Render loop

- `requestAnimationFrame`, throttled to ~15 fps (subtle look, low CPU).
- Canvas sized to `innerWidth × innerHeight × devicePixelRatio` for crispness;
  recomputed on `resize` (debounced).
- The RAF handle and all event listeners are torn down on unmount.

## Accessibility / motion

- When `prefers-reduced-motion: reduce`, render a **single static frame** — no
  animation loop. Reduced-motion users still get the texture without movement.

## Error handling / robustness

- If `canvas.getContext('2d')` returns `null` (e.g. jsdom, or an unsupported
  environment), the component **no-ops gracefully** — no animation, no throw.
- Resize handler is debounced to avoid thrashing.

## Testing

Extend `apps/landing/src/app/LandingPage.spec.tsx` (jsdom / vitest):

- The canvas renders and is `aria-hidden`.
- The component mounts and unmounts without throwing when `getContext` returns
  `null` (jsdom default).
- The reduced-motion branch is exercised via a `matchMedia` stub returning
  `matches: true`.

## Constraints

- **No new dependencies** — plain Canvas 2D API + a tiny hash/value-noise helper.
- Plain CSS only (consistent with the rest of `apps/landing`).
