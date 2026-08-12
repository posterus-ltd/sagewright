import { useIsDemo } from '../DemoModeProvider';

/**
 * Full-height token. The SPA fills the browser viewport (`100dvh`); the embedded demo
 * web component fills its host box instead (`100%`), so viewport units would blow past
 * the frame. Derived from the demo-mode context (`useIsDemo`) so there's no build-time
 * env flag — the SPA renders no `DemoModeProvider` and reads the default `100dvh`.
 */
export const useAppHeight = (): string => (useIsDemo() ? '100%' : '100dvh');
