import { type FC } from 'react';

import { ThemeMode, useTheme } from './use-theme';

interface ThemeMeta {
  /** Terminal-flavored glyph for the active scheme. */
  readonly glyph: string;
  /** Short label shown next to the glyph. */
  readonly label: string;
}

const THEME_META: Record<ThemeMode, ThemeMeta> = {
  [ThemeMode.System]: { glyph: '◐', label: 'auto' },
  [ThemeMode.Light]: { glyph: '○', label: 'light' },
  [ThemeMode.Dark]: { glyph: '●', label: 'dark' },
};

/**
 * A small fixed control in the top-right corner that cycles the color scheme
 * (auto → light → dark). The choice persists via {@link useTheme}.
 */
export const ThemeToggle: FC = () => {
  const { mode, cycleMode } = useTheme();
  const meta = THEME_META[mode];

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleMode}
      aria-label={`Theme: ${meta.label}. Click to change.`}
      title={`Theme: ${meta.label}`}
    >
      <span className="theme-toggle__glyph" aria-hidden="true">
        {meta.glyph}
      </span>
      {meta.label}
    </button>
  );
};
