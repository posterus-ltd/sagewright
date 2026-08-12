import { type CSSProperties, type FC, useEffect, useRef, useState } from 'react';

// The demo web component is a separate, self-contained build of the control plane
// (see apps/control-plane-web/vite.demo.config.mts). The landing serves it under
// /demo/ (dev + build wired in apps/landing/vite.config.mts).
//
// Rather than augment JSX.IntrinsicElements (which lives at a different namespace
// across React 18/19 type setups), cast the tag string to a component. At runtime a
// string `type` renders as a host element — i.e. a real <sagewright-demo> — while the
// cast just gives us prop typing at compile time.
const SagewrightDemoElement = 'sagewright-demo' as unknown as FC<{
  route?: string;
  style?: CSSProperties;
}>;

const DEMO_SRC = '/demo/sagewright-demo.js';

// Load the (heavy) demo bundle at most once per page, and only on intent.
let scriptPromise: Promise<void> | null = null;
const loadDemoScript = (): Promise<void> =>
  (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DEMO_SRC}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.type = 'module';
    s.src = DEMO_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load the demo bundle'));
    document.head.appendChild(s);
  }));

/**
 * A framed "live demo" window that boots the real control-plane UI (in demo mode)
 * inside a shadow-DOM custom element. The bundle is large, so it stays off the
 * landing page's critical path: it loads only once the window scrolls into view (or
 * the visitor clicks "launch"), keeping first paint fast. Shadow-DOM isolation means
 * the app's MUI styling and the landing's terminal CSS can't leak into each other.
 */
export const SagewrightDemo: FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false); // in view or clicked
  const [ready, setReady] = useState(false); // bundle loaded + element defined
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Arm when the frame nears the viewport (or immediately if IO is unavailable).
  useEffect(() => {
    if (armed || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setArmed(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    let cancelled = false;
    loadDemoScript()
      .then(() => customElements.whenDefined('sagewright-demo'))
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [armed]);

  // Keep the button's label/icon in sync with the actual fullscreen state — the user can
  // also leave fullscreen with Esc, which fires the same event.
  useEffect(() => {
    const sync = (): void => {
      const active =
        document.fullscreenElement ??
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ??
        null;
      setFullscreen(active === frameRef.current);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFullscreen = (): void => {
    const el = frameRef.current;
    if (!el) return;
    const doc = document as unknown as { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element };
    const node = el as unknown as { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen();
    } else {
      node.webkitRequestFullscreen?.();
    }
  };

  return (
    <section className="window" ref={ref}>
      <div className="window__bar">
        <span className="window__dots" aria-hidden="true">
          ● ● ●
        </span>
        <span className="window__title">live_demo.app · app.sagewright.dev</span>
        {ready && (
          <button
            type="button"
            className="window__fullscreen"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {fullscreen ? '⤪' : '⛶'}
          </button>
        )}
      </div>
      <div className="window__body">
        <p className="section-lead">
          <span className="hl">The real control plane — live in your browser.</span> This
          is the actual app running on mock data: click through sessions, watch an agent
          work in a terminal, and explore the canvas &amp; galaxy. Nothing here touches a
          server.
        </p>

        <div className="demo-frame" ref={frameRef}>
          {ready ? (
            // Open straight onto the hero interactive session (a live agent terminal)
            // rather than the sessions list, so a visitor lands on the app working. The
            // in-memory router treats this as its initial entry; the detail page's
            // "Sessions" breadcrumb navigates back to the list. `s-hero` is the demo
            // fixture's HERO_SESSION_ID (apps/control-plane-web/src/demo/mock-data.ts).
            <SagewrightDemoElement route="/tasks/s-hero" style={{ display: 'block', width: '100%', height: '100%' }} />
          ) : failed ? (
            <div className="demo-frame__fallback">
              <p>The live demo couldn&rsquo;t load. Try the screenshots above, or the repo.</p>
            </div>
          ) : (
            <button
              type="button"
              className="demo-frame__launch"
              onClick={() => setArmed(true)}
            >
              {armed ? '❯ booting the control plane…' : '❯ launch the live demo'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
