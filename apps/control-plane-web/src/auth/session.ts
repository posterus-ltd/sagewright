// Client-side record of who is logged in. The real authorization is the
// httpOnly `vm_session` cookie set by the server; this only drives the UI's
// "show app vs. redirect to /login" decision (see useAuth + router). The two
// can desync (cookie expires / SESSION_SECRET rotates) — the api client clears
// this on a 401 so an invalid cookie sends the user back to /login.
export const SESSION_STORAGE_KEY = 'vm_display_name';

export const readSession = (): string | null => localStorage.getItem(SESSION_STORAGE_KEY);
export const writeSession = (displayName: string): void => localStorage.setItem(SESSION_STORAGE_KEY, displayName);
export const clearSession = (): void => localStorage.removeItem(SESSION_STORAGE_KEY);
