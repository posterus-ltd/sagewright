import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { QueryClient } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
// Imported as a string (not injected into document.head) so it can be placed inside
// the shadow root — where the terminal actually lives. Emotion/MUI styles are handled
// separately by the shadow-scoped cache below.
import xtermCss from '@xterm/xterm/css/xterm.css?inline';

import { AppProviders } from '../AppProviders';
import { createAppRouter } from '../router';
import type { TransportClient } from '../tasks/transport';
import { ensureI18N } from '../i18n/init';
import { createDemoApiClient } from './api';
import { DEMO_USER } from './mock-data';
import { startDemoDirector } from './director';
import { demoStore } from './store';
import { createDemoEventStream, createDemoTerminalSocket } from './streams';
import { DemoModeProvider } from '../DemoModeProvider';

const ELEMENT_NAME = 'sagewright-demo';

// The in-memory mock data layer, provided to the app through `AppProviders` (the REST
// client + streaming transport props). The SPA provides the real clients instead, so the
// SPA's api/client + transport import nothing from here and all demo code tree-shakes out.
const demoApiClient = createDemoApiClient(demoStore());
const demoTransport: TransportClient = {
  openEventStream: (path) =>
    createDemoEventStream(path) as unknown as EventSource,
  openTerminalSocket: (taskId, kind) =>
    createDemoTerminalSocket(taskId, kind) as unknown as WebSocket,
};

/**
 * `<sagewright-demo>` — the control plane, in demo mode, packaged as a self-contained
 * custom element for embedding in the marketing site. It mounts the real app into a
 * shadow root so its MUI/Emotion styling is fully isolated from (and can't leak into)
 * the host page. All data is in-memory mock data; a memory router keeps navigation
 * internal so it never touches the host page's URL.
 */
class SagewrightDemo extends HTMLElement {
  private root: Root | null = null;
  private stopDirector: (() => void) | null = null;
  private mounting = false;

  connectedCallback(): void {
    if (this.root || this.mounting) return;
    this.mounting = true;

    // attachShadow can run only once; reuse it (and clear it) across re-attach.
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.replaceChildren();

    // Terminal (xterm) CSS scoped to the shadow root.
    const style = document.createElement('style');
    style.textContent = xtermCss;

    // The React mount node + a sibling node MUI/notistack overlays portal into, both
    // inside the shadow root so overlay CSS (from the shadow-scoped Emotion cache)
    // applies. A dark placeholder background avoids a flash before first paint.
    const mountEl = document.createElement('div');
    mountEl.style.cssText =
      'height:100%;width:100%;overflow:hidden;background:#0d1117';
    const portal = document.createElement('div');
    shadow.append(style, mountEl, portal);

    // Emotion inserts all MUI/CssBaseline styles into the shadow root (not the
    // document head), which is what makes shadow-DOM isolation work.
    const cache = createCache({ key: 'swd', container: shadow, prepend: true });
    const queryClient = new QueryClient();
    const initialRoute = this.getAttribute('route') ?? '/';

    void ensureI18N().then(() => {
      // Bail if we were detached again while i18n was initialising.
      if (!this.isConnected) {
        this.mounting = false;
        return;
      }
      this.root = createRoot(mountEl);
      // No <StrictMode>: it double-invokes effects in dev, which churns xterm/WebGL
      // imperative setup. The SPA keeps StrictMode; prod behaviour is identical.
      this.root.render(
        <CacheProvider value={cache}>
          <DemoModeProvider>
            <AppProviders
              queryClient={queryClient}
              router={createAppRouter({ initialEntries: [initialRoute] })}
              apiClient={demoApiClient}
              transport={demoTransport}
              portalContainer={portal}
              snackbarDomRoot={portal}
              // Seed an in-memory, already-signed-in identity; never touch host localStorage.
              // The demo opens with the nav sidebar collapsed to keep the showcase focused
              // on the canvas rather than the chrome.
              initialPreferences={{
                displayName: DEMO_USER.username,
                userId: DEMO_USER.id,
                sidebarCollapsed: true,
              }}
              persistPreferences={false}
            />
          </DemoModeProvider>
        </CacheProvider>,
      );
      this.stopDirector = startDemoDirector(demoStore());
      this.mounting = false;
    });
  }

  disconnectedCallback(): void {
    this.stopDirector?.();
    this.stopDirector = null;
    // React 19 unmount runs Terminal/useTaskStream/three cleanup (sockets, disposers).
    this.root?.unmount();
    this.root = null;
    this.mounting = false;
  }
}

if (!customElements.get(ELEMENT_NAME))
  customElements.define(ELEMENT_NAME, SagewrightDemo);

export { SagewrightDemo, ELEMENT_NAME };
