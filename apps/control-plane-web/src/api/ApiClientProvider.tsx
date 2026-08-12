import { createContext, useContext, type FC, type ReactNode } from 'react';

import { createRealApiClient, type ApiClient } from './client';

/**
 * Dependency injection for the REST client, modelled on `QueryClientProvider`: hand an
 * `ApiClient` instance to the provider and read it anywhere with `useApiClient()`. The
 * browser SPA (`main.tsx`) provides the real fetch client; the embedded demo web component
 * (`demo/demo-element.tsx`) provides an in-memory mock client backed by seeded fixtures.
 *
 * The context defaults to a real client so a consumer rendered without a provider (e.g. an
 * isolated unit test) behaves like the old singleton rather than throwing.
 */
const ApiClientContext = createContext<ApiClient>(createRealApiClient());

export const ApiClientProvider: FC<{ client: ApiClient; children: ReactNode }> = ({ client, children }) => (
  <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
);

export const useApiClient = (): ApiClient => useContext(ApiClientContext);
