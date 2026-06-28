import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';

import { ScheduledPromptDialog } from '../../scheduled/ScheduledPromptDialog';
import { CommandPalette } from './CommandPalette';
import { isPaletteChord } from './shortcut';

interface CommandPaletteContextValue {
  open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

// Lets any descendant (e.g. the sidebar button) open the palette.
export const useCommandPalette = (): CommandPaletteContextValue => {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  return ctx;
};

// Owns palette open state, the global ⌘K/Ctrl+K chord, and the scheduled-task
// dialog so "Schedule a task" works from anywhere in the app.
export const CommandPaletteProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);

  const open = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isPaletteChord(e)) return;
      e.preventDefault();
      setPaletteOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(() => ({ open }), [open]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNewScheduledTask={() => {
            setPaletteOpen(false);
            setScheduledOpen(true);
          }}
        />
      )}
      {scheduledOpen && <ScheduledPromptDialog open onClose={() => setScheduledOpen(false)} />}
    </CommandPaletteContext.Provider>
  );
};
