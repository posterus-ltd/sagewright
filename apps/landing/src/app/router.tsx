import { type FC } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';

import { ErrorBoundary } from './ErrorBoundary';
import { LandingPage } from './LandingPage';

const router = createBrowserRouter([{ path: '/', element: <LandingPage /> }]);

export const AppRouter: FC = () => (
  <ErrorBoundary>
    <RouterProvider router={router} />
  </ErrorBoundary>
);
