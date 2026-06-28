import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserPreferencesProvider } from './preferences/UserPreferencesProvider';
import { AppRouter } from './router';
import { ThemeModeProvider } from './theme/ThemeModeProvider';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserPreferencesProvider>
      <ThemeModeProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <SnackbarProvider>
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
