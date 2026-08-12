import { createContext, useContext, type FC, type ReactNode } from 'react';

import { createRealTransport, type TransportClient } from './transport';

/**
 * Dependency injection for the live-streaming transports (SSE + terminal WebSocket),
 * modelled on `QueryClientProvider`. The browser SPA provides `createRealTransport()`;
 * the embedded demo provides in-memory mocks. Defaults to a real transport so a consumer
 * rendered without a provider behaves like the old module factories rather than throwing.
 */
const TransportContext = createContext<TransportClient>(createRealTransport());

export const TransportProvider: FC<{ transport: TransportClient; children: ReactNode }> = ({
  transport,
  children,
}) => <TransportContext.Provider value={transport}>{children}</TransportContext.Provider>;

export const useTransport = (): TransportClient => useContext(TransportContext);
