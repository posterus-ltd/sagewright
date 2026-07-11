import { type FC } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';

import { AboutPage } from './about/AboutPage';
import { AdminPage } from './admin/AdminPage';
import { LoginPage } from './auth/LoginPage';
import { useAuth } from './auth/useAuth';
import { CanvasPage } from './canvas/CanvasPage';
import { Layout } from './components/Layout';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { SettingsPage } from './config/SettingsPage';
import { GalaxyPage } from './galaxy/GalaxyPage';
import { OverviewPage } from './overview/OverviewPage';
import { ScheduledPromptsPage } from './scheduled/ScheduledPromptsPage';
import { SessionsListPage } from './sessions/SessionsListPage';
import { TaskDetailPage } from './tasks/TaskDetailPage';
import { WorkflowsListPage } from './workflows/WorkflowsListPage';
import { WorkflowRunPage } from './workflows/WorkflowRunPage';

const AuthGate: FC = () => {
  const { displayName } = useAuth();
  return displayName ? <Layout /> : <Navigate to="/login" replace />;
};

const router = createBrowserRouter([
  // A pathless root route carries the error element so render crashes thrown in
  // any descendant route surface our fallback instead of react-router's default.
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <AuthGate />, children: [
        { index: true, element: <SessionsListPage /> },
        { path: 'overview', element: <OverviewPage /> },
        { path: 'canvas', element: <CanvasPage /> },
        { path: 'galaxy', element: <GalaxyPage /> },
        { path: 'scheduled', element: <ScheduledPromptsPage /> },
        { path: 'workflows', element: <WorkflowsListPage /> },
        { path: 'workflows/runs/:id', element: <WorkflowRunPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'about', element: <AboutPage /> },
        // Hidden admin route — intentionally not surfaced in the sidebar.
        { path: 'adm', element: <AdminPage /> },
        { path: 'tasks/:id', element: <TaskDetailPage /> },
      ] },
    ],
  },
]);

export const AppRouter: FC = () => <RouterProvider router={router} />;
