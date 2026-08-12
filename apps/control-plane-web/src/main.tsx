import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

import { QueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createRealApiClient } from './api/client';
import { AppProviders } from './AppProviders';
import { createAppRouter } from './router';
import { createRealTransport } from './tasks/transport';
import { initI18N } from './i18n';

const queryClient = new QueryClient();
const apiClient = createRealApiClient();
const transport = createRealTransport();

initI18N().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders
        queryClient={queryClient}
        router={createAppRouter()}
        apiClient={apiClient}
        transport={transport}
      />
    </StrictMode>,
  );
});
