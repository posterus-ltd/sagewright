// Design tokens — the single source of truth for Sagewright's visual language.
// A near-monochrome, developer-tool palette (GitHub Primer lineage) with a
// terminal-green accent. Two surfaces deep, hairline borders instead of heavy
// shadows, small radii. Tuned for both dark and light with the same structure.

export const fonts = {
  sans: "'Inter Variable', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
};

export const radius = 6;

export interface Palette {
  bg: string; // app background
  surface: string; // sidebar / cards
  elevated: string; // hover / raised surfaces
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  onAccent: string;
  success: string;
  error: string;
  warning: string;
  info: string;
}

export const dark: Palette = {
  bg: '#0d1117',
  surface: '#161b22',
  elevated: '#1c2128',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#7d8590',
  accent: '#f97316',
  accentHover: '#ea580c',
  onAccent: '#0d1117',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
};

export const light: Palette = {
  bg: '#ffffff',
  surface: '#f6f8fa',
  elevated: '#eaeef2',
  border: '#d0d7de',
  text: '#1f2328',
  muted: '#656d76',
  accent: '#c2410c',
  accentHover: '#9a3412',
  onAccent: '#ffffff',
  success: '#1a7f37',
  error: '#cf222e',
  warning: '#9a6700',
  info: '#0969da',
};

/** The two concrete colour schemes a theme resolves to (see ThemeMode). Keys the
 *  palette lookup, so it lives with the tokens it selects. */
export enum ResolvedMode {
  LIGHT = 'light',
  DARK = 'dark',
}

export const palettes: Record<ResolvedMode, Palette> = {
  [ResolvedMode.DARK]: dark,
  [ResolvedMode.LIGHT]: light,
};
