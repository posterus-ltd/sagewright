import { type FC } from 'react';
import { useRouteError } from 'react-router';

import { ErrorFallback } from './ErrorFallback';

/**
 * The route-level error element. react-router's data router catches render
 * errors thrown inside a route with its own internal boundary instead of
 * letting them bubble to the top-level {@link ErrorBoundary}, so this component
 * reads the caught error via {@link useRouteError} and renders the same shared
 * {@link ErrorFallback}. Wire it up as a route `errorElement` in `router.tsx`.
 */
export const RouteErrorBoundary: FC = () => {
  const error = useRouteError();
  const normalized =
    error instanceof Error ? error : new Error(String(error));

  return <ErrorFallback error={normalized} />;
};
