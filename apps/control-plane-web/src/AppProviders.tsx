import CloseRounded from '@mui/icons-material/CloseRounded';
import { IconButton } from '@mui/material';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { closeSnackbar, SnackbarProvider } from 'notistack';
import { type FC } from 'react';
import { RouterProvider, type RouterProviderProps } from 'react-router';

import { ApiClientProvider } from './api/ApiClientProvider';
import type { ApiClient } from './api/client';
import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserPreferencesProvider } from './preferences/UserPreferencesProvider';
import type { UserPreferences } from './preferences/model';
import { TransportProvider } from './tasks/TransportProvider';
import type { TransportClient } from './tasks/transport';
import { ThemeModeProvider } from './theme/ThemeModeProvider';

/**
 * The full provider stack that wraps the router, shared by the browser SPA
 * (`main.tsx`) and the embedded demo web component (`demo/demo-element.tsx`) so the
 * two can't drift. Everything the demo needs to differ is an optional prop that is
 * `undefined`/default in the SPA:
 *
 * - `router` — a browser router (SPA) or a memory router (demo, so it never touches
 *   the host page URL).
 * - `portalContainer` / `snackbarDomRoot` — a node inside the demo's shadow root that
 *   MUI overlays and notistack render into, instead of `document.body`.
 * - `initialPreferences` / `persistPreferences` — let the demo seed an in-memory
 *   signed-in identity without reading or writing the host page's localStorage.
 * - `apiClient` / `transport` — the REST + streaming clients, injected QueryClient-style.
 *   The SPA passes the real fetch/EventSource/WebSocket clients; the demo passes in-memory
 *   mocks. `demo` flips the cosmetic demo-mode UI branches.
 */
export interface AppProvidersProps {
  queryClient: QueryClient;
  router: RouterProviderProps['router'];
  apiClient: ApiClient;
  transport: TransportClient;
  portalContainer?: HTMLElement;
  snackbarDomRoot?: HTMLElement;
  initialPreferences?: Partial<UserPreferences>;
  persistPreferences?: boolean;
}

export const AppProviders: FC<AppProvidersProps> = ({
  queryClient,
  router,
  apiClient,
  transport,
  portalContainer,
  snackbarDomRoot,
  initialPreferences,
  persistPreferences,
}) => (
  <UserPreferencesProvider
    initialPreferences={initialPreferences}
    persist={persistPreferences}
  >
    <ThemeModeProvider portalContainer={portalContainer}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ApiClientProvider client={apiClient}>
            <TransportProvider transport={transport}>
              <SnackbarProvider
                domRoot={snackbarDomRoot}
                action={(snackbarId) => (
                  <IconButton
                    size="small"
                    aria-label="Dismiss"
                    onClick={() => closeSnackbar(snackbarId)}
                    sx={{ color: 'inherit' }}
                  >
                    <CloseRounded fontSize="small" />
                  </IconButton>
                )}
              >
                <ConfirmDialogProvider>
                  <RouterProvider router={router} />
                </ConfirmDialogProvider>
              </SnackbarProvider>
            </TransportProvider>
          </ApiClientProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeModeProvider>
  </UserPreferencesProvider>
);
