import {
  LEGACY_DISPLAY_NAME_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  type UserPreferences,
} from '../preferences/model';

// Client-side record of who is logged in. The real authorization is the
// httpOnly `vm_session` cookie set by the server; this only drives the UI's
// "show app vs. redirect to /login" decision (see useAuth + router). The two
// can desync (cookie expires / SESSION_SECRET rotates) — the api client clears
// this on a 401 so an invalid cookie sends the user back to /login.
export const clearSession = (): void => {
  try {
    const preferences = JSON.parse(
      localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}',
    ) as Partial<UserPreferences>;
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ ...preferences, userId: null, displayName: null }));
  } catch {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ userId: null, displayName: null }));
  }
  localStorage.removeItem(LEGACY_DISPLAY_NAME_STORAGE_KEY);
};
