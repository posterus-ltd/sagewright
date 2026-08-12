import { Box, CircularProgress } from '@mui/material';
import { type FC } from 'react';
import {
  Navigate,
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router';

import { useMe } from './api/hooks';
import { AboutPage } from './about/AboutPage';
import { AdminPage } from './admin/AdminPage';
import { ForcedChangePassword } from './auth/ForcedChangePassword';
import { LoginPage } from './auth/LoginPage';
import { useAuth } from './auth/useAuth';
import { Layout } from './components/Layout';
import { NotFoundPage } from './components/NotFoundPage';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { SettingsPage } from './config/SettingsPage';
import { OverviewPage } from './overview/OverviewPage';
import { ScheduledPromptsPage } from './scheduled/ScheduledPromptsPage';
import { SessionsListPage } from './sessions/SessionsListPage';
import { TaskDetailPage } from './tasks/TaskDetailPage';
import { useAppHeight } from './theme/layout';

const FullScreenSpinner: FC = () => {
  const appH = useAppHeight();
  return (
    <Box sx={{ minHeight: appH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  );
};

// Reached only once the client believes it's logged in. `useMe` is the server's word:
// while it loads we hold a spinner, and if the account still `mustChangePassword` we
// render the forced-change screen instead of the app — one seam gates the whole SPA.
const AuthedApp: FC = () => {
  const { data: me } = useMe();
  if (!me) return <FullScreenSpinner />;
  if (me.mustChangePassword) return <ForcedChangePassword />;
  return <Layout />;
};

const AuthGate: FC = () => {
  const { displayName } = useAuth();
  return displayName ? <AuthedApp /> : <Navigate to="/login" replace />;
};

// The heavy visual routes (three.js galaxy, @xyflow/react canvas + workflows) are
// code-split so they load on demand — shrinking the SPA's initial chunk and keeping
// the demo web component's first paint light (the deferred chunks load when a visitor
// opens that tab). react-router holds the current route's UI until the module resolves.
const routes: RouteObject[] = [
  // A pathless root route carries the error element so render crashes thrown in
  // any descendant route surface our fallback instead of react-router's default.
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: <AuthGate />,
        children: [
          { index: true, element: <SessionsListPage /> },
          { path: 'overview', element: <OverviewPage /> },
          { path: 'canvas', lazy: () => import('./canvas/CanvasPage').then((m) => ({ Component: m.CanvasPage })) },
          { path: 'galaxy', lazy: () => import('./galaxy/GalaxyPage').then((m) => ({ Component: m.GalaxyPage })) },
          { path: 'scheduled', element: <ScheduledPromptsPage /> },
          { path: 'workflows', lazy: () => import('./workflows/WorkflowsListPage').then((m) => ({ Component: m.WorkflowsListPage })) },
          { path: 'workflows/runs/:id', lazy: () => import('./workflows/WorkflowRunPage').then((m) => ({ Component: m.WorkflowRunPage })) },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'about', element: <AboutPage /> },
          // Hidden admin route — intentionally not surfaced in the sidebar.
          { path: 'adm', element: <AdminPage /> },
          { path: 'tasks/:id', element: <TaskDetailPage /> },
        ],
      },
      // Catch-all: unmatched paths land on the 404 page rather than bubbling a
      // route error into the fault fallback. Sits outside the auth gate so a
      // mistyped URL shows the same friendly page whether or not you're signed in.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/**
 * Build the app router. With no options it's a browser router (the SPA). Passing
 * `opts` builds an in-memory router — used by the embedded demo web component so it
 * routes internally without ever touching the host landing page's URL/history.
 */
export const createAppRouter = (opts?: { initialEntries?: string[] }) =>
  opts
    ? createMemoryRouter(routes, { initialEntries: opts.initialEntries ?? ['/'] })
    : createBrowserRouter(routes);
