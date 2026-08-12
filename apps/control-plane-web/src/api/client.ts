import { clearSession } from '../auth/session';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ApiClient = ReturnType<typeof createApiClient>;

// A 401 on /api/login means "bad credentials" — surfaced to the login form, not
// a session expiry — so it must not trigger the global sign-out.
const LOGIN_PATH = '/api/login';

// Machine-readable body the API returns when a user must change their password before
// the app opens up (see the auth guard's allowlist).
const PASSWORD_CHANGE_REQUIRED = 'password_change_required';

export const createApiClient = (
  baseUrl: string,
  onUnauthorized?: (path: string) => void,
  onPasswordChangeRequired?: (path: string) => void,
) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const message = await res.text();
      if (res.status === 401 && path !== LOGIN_PATH) onUnauthorized?.(path);
      else if (res.status === 403 && message.includes(PASSWORD_CHANGE_REQUIRED)) onPasswordChangeRequired?.(path);
      throw new ApiError(res.status, message);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  };
  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
};

// On an unexpected 401 the cookie is gone/expired but localStorage still says
// we're logged in. Clear it and hard-redirect to /login so the app stops
// polling 401s and the user can re-authenticate.
const handleUnauthorized = (): void => {
  clearSession();
  if (window.location.pathname !== '/login') window.location.assign('/login');
};

// Safety net for a 403 password_change_required raised by a background request (e.g. an
// admin reset the password of a user who's mid-session). Re-drive the auth gate so it
// renders the forced-change screen: navigate to the root, or reload if already there.
// The gate's own requests (me / change-password / logout) are allowlisted, so this can't
// loop. The live `useMe` check is the primary mechanism; this unsticks an idle tab.
const handlePasswordChangeRequired = (): void => {
  if (window.location.pathname === '/') window.location.reload();
  else window.location.assign('/');
};

/**
 * The real, same-origin fetch client used by the browser SPA. It's provided to the app
 * through `ApiClientProvider` (see api/ApiClientProvider.tsx) and read via `useApiClient`;
 * the demo build provides an in-memory mock client instead, so no demo code is pulled into
 * the SPA bundle at all.
 */
export const createRealApiClient = (): ApiClient =>
  createApiClient('', handleUnauthorized, handlePasswordChangeRequired);
