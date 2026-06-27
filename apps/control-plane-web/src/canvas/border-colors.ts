// Curated palette for per-widget border colors. Hand-picked for legible
// contrast against both the dark (#0d1117) and light (#ffffff) canvas surfaces,
// drawn from the design-token accent family plus a few complementary hues so
// adjacent widgets stay visually distinct. New widgets pick one at random; the
// stored value is always a plain hex string (see SessionPlacement.borderColor).
export const BORDER_COLOR_PALETTE = [
  '#f97316', // orange (accent)
  '#3fb950', // green
  '#58a6ff', // blue
  '#d29922', // amber
  '#f85149', // red
  '#a371f7', // purple
  '#ec6cb9', // pink
  '#39c5cf', // teal
  '#db61a2', // magenta
  '#7ee787', // mint
] as const;

/** Palette color at an arbitrary integer index, wrapping by modulo. */
export const borderColorAt = (n: number): string => {
  const len = BORDER_COLOR_PALETTE.length;
  // Modulo keeps the index in range, so the lookup is always defined.
  return BORDER_COLOR_PALETTE[((Math.trunc(n) % len) + len) % len]!;
};

/** A random border color from the palette, for newly added widgets. */
export const pickRandomBorderColor = (): string => borderColorAt(Math.floor(Math.random() * BORDER_COLOR_PALETTE.length));

/** Distinct, defined border colors in first-seen order — powers quick-select. */
export const distinctBorderColors = (values: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

/** The color to render as a widget's border: the custom color, or the theme default. */
export const effectiveBorderColor = (borderColor: string | undefined): string => borderColor ?? 'divider';

/** The color a selection glow is tinted with: the custom color, or a fallback (theme accent). */
export const glowColor = (borderColor: string | undefined, fallback: string): string => borderColor ?? fallback;
