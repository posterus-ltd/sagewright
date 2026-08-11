import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

import CloseRounded from '@mui/icons-material/CloseRounded';
import { IconButton } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { closeSnackbar, SnackbarProvider } from 'notistack';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserPreferencesProvider } from './preferences/UserPreferencesProvider';
import { AppRouter } from './router';
import { ThemeModeProvider } from './theme/ThemeModeProvider';
import { initI18N } from './i18n';

const queryClient = new QueryClient();

initI18N().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <UserPreferencesProvider>
        <ThemeModeProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <SnackbarProvider
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
                  <AppRouter />
                </ConfirmDialogProvider>
              </SnackbarProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </ThemeModeProvider>
      </UserPreferencesProvider>
    </StrictMode>,
  );
});
