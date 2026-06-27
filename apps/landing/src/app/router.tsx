import { type FC } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';

import { AccessGate } from './AccessGate';
import { ErrorBoundary } from './ErrorBoundary';
import { LandingPage } from './LandingPage';

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/access', element: <AccessGate /> },
]);

export const AppRouter: FC = () => (
  <ErrorBoundary>
    <RouterProvider router={router} />
  </ErrorBoundary>
);
