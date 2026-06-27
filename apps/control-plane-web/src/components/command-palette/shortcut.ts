// The ⌘K / Ctrl+K hint, resolved once for the running platform. Mac shows the
// command glyph; everyone else gets the spelled-out modifier.
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);

export const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

// True when the event is the palette chord (⌘K on mac, Ctrl+K elsewhere).
export const isPaletteChord = (e: KeyboardEvent): boolean =>
  (e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K');
