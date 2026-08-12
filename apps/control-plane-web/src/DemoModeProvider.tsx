import { createContext, useContext, type FC, type ReactNode } from 'react';

/**
 * Whether the app is running as the embedded `<sagewright-demo>` showcase (mock data,
 * no real backend or auth) rather than the real control plane. It gates a few cosmetic
 * UI branches — e.g. the sidebar hides Settings + Sign-out in the demo.
 *
 */
const DemoModeContext = createContext<boolean>(false);

export const DemoModeProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <DemoModeContext.Provider value={true}>{children}</DemoModeContext.Provider>
);

export const useIsDemo = (): boolean => useContext(DemoModeContext);
