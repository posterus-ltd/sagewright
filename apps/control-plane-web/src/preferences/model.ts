import type { GalaxyTimeWindow } from '../galaxy/galaxy-time-window';
import type { SessionQuickAction } from '../tasks/session-quick-actions';
import type { ThemeMode } from '../theme/theme';

// User-facing preferences persisted on the client. Add new preferences here; the
// provider serialises this whole object under a single localStorage key.
export interface UserPreferences {
  // When true the main content stretches to the full available width instead of
  // being capped at the shared max width.
  fullWidthContent: boolean;
  // When true the navigation sidebar is collapsed to an icon-only rail.
  sidebarCollapsed: boolean;
  // When true the /workspaces right-hand workspaces list is collapsed to a thin strip.
  // UI-only; the active workspace itself lives in the server blob (see workspace.schema).
  workspacesListCollapsed: boolean;
  // Preferred colour theme. 'system' follows the OS preference, resolved live
  // for rendering by ThemeModeProvider.
  themeMode: ThemeMode;
  // Client-side record of who is logged in. The httpOnly cookie remains the
  // source of truth for server authorization. `userId` is the identity key used to
  // match a session's `createdBy`; `displayName` is the human label shown in the UI.
  userId: string | null;
  displayName: string | null;
  // Activity window preselected on the Galaxy view; defaults to recent activity
  // at the call site so the view opens as "what's happening lately".
  galaxyTimeWindow: GalaxyTimeWindow;
  // Which quick actions the session bar shows, in display order.
  sessionQuickActions: SessionQuickAction[];
}

// localStorage key holding the serialised UserPreferences blob.
export const PREFERENCES_STORAGE_KEY = 'sagewright.preferences';

// Previous localStorage key for displayName, kept only for one-time migration.
export const LEGACY_DISPLAY_NAME_STORAGE_KEY = 'vm_display_name';
