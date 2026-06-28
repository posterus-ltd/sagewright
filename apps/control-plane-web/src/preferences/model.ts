// User-facing preferences persisted on the client. Add new preferences here; the
// provider serialises this whole object under a single localStorage key.
//
// Theme mode is intentionally NOT here — it has its own provider with live
// OS-preference following (see ThemeModeProvider).
export interface UserPreferences {
  // When true the main content stretches to the full available width instead of
  // being capped at the shared max width.
  fullWidthContent: boolean;
}

// localStorage key holding the serialised UserPreferences blob.
export const PREFERENCES_STORAGE_KEY = 'sagewright.preferences';
