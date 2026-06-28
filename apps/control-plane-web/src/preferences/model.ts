import type { ThemeMode } from '../theme/theme';

// User-facing preferences persisted on the client. Add new preferences here; the
// provider serialises this whole object under a single localStorage key.
export interface UserPreferences {
  // When true the main content stretches to the full available width instead of
  // being capped at the shared max width.
  fullWidthContent: boolean;
  // When true the navigation sidebar is collapsed to an icon-only rail.
  sidebarCollapsed: boolean;
  // Preferred colour theme. 'system' follows the OS preference, resolved live
  // for rendering by ThemeModeProvider.
  themeMode: ThemeMode;
  // Client-side record of who is logged in. The httpOnly cookie remains the
  // source of truth for server authorization.
  displayName: string | null;
}

// localStorage key holding the serialised UserPreferences blob.
export const PREFERENCES_STORAGE_KEY = 'sagewright.preferences';

// Previous localStorage key for displayName, kept only for one-time migration.
export const LEGACY_DISPLAY_NAME_STORAGE_KEY = 'vm_display_name';
