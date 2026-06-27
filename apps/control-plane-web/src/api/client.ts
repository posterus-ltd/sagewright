import { clearSession } from '../auth/session';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// A 401 on /api/login means "bad credentials" — surfaced to the login form, not
// a session expiry — so it must not trigger the global sign-out.
const LOGIN_PATH = '/api/login';

export const createApiClient = (baseUrl: string, onUnauthorized?: (path: string) => void) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      if (res.status === 401 && path !== LOGIN_PATH) onUnauthorized?.(path);
      throw new ApiError(res.status, await res.text());
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

export const apiClient = createApiClient('', handleUnauthorized);
