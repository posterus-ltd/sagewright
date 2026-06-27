import { type FC } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';

import { AboutPage } from './about/AboutPage';
import { LoginPage } from './auth/LoginPage';
import { useAuth } from './auth/useAuth';
import { CanvasPage } from './canvas/CanvasPage';
import { Layout } from './components/Layout';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { SettingsPage } from './config/SettingsPage';
import { ScheduledPromptsPage } from './scheduled/ScheduledPromptsPage';
import { SessionsListPage } from './sessions/SessionsListPage';
import { TaskDetailPage } from './tasks/TaskDetailPage';

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
        { path: 'canvas', element: <CanvasPage /> },
        { path: 'scheduled', element: <ScheduledPromptsPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'about', element: <AboutPage /> },
        { path: 'tasks/:id', element: <TaskDetailPage /> },
      ] },
    ],
  },
]);

export const AppRouter: FC = () => <RouterProvider router={router} />;
