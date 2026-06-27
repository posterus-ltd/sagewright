import { type FC } from 'react';
import { Link } from 'react-router';

import { AsciiField } from './AsciiField';
import { ThemeToggle } from './ThemeToggle';
import { LOCK_BANNER } from './ascii';

const GITHUB_URL = 'https://github.com/posterus-ltd/sagewright';

/**
 * The private-beta access gate. The landing page's `launch_control_plane` CTA
 * routes here instead of opening the control plane, which is invite-only while
 * Sagewright is in private beta. The page explains that and points visitors to
 * GitHub to request access; `❯ cd ..` returns to the landing page.
 */
export const AccessGate: FC = () => (
  <>
    <AsciiField />
    <ThemeToggle />
    <main className="page access">
      <section className="window">
        <div className="window__bar">
          <span className="window__dots" aria-hidden="true">
            ● ● ●
          </span>
          <span className="window__title">access.lock</span>
        </div>
        <div className="window__body access__body">
          <pre className="access__lock" aria-hidden="true">
            {LOCK_BANNER}
          </pre>

          <p className="prompt access__prompt">
            <span className="prompt__sigil">❯</span> ./launch_control_plane
            <br />
            <span className="access__denied">
              permission denied: private beta
            </span>
            <span className="cursor" aria-hidden="true">
              █
            </span>
          </p>

          <h1 className="access__title">PRIVATE BETA</h1>

          <p className="tagline access__lead">
            The control plane is currently{' '}
            <span className="hl">invite-only</span>. Sagewright is in private
            beta while we harden the fleet — want in? Reach out and we&rsquo;ll
            get you access.
          </p>

          <a className="cta" href={GITHUB_URL} target="_blank" rel="noreferrer">
            ❯ request_access
          </a>

          <p className="access__back">
            <Link className="footer__link" to="/">
              ❯ cd ..
            </Link>
          </p>
        </div>
      </section>
    </main>
  </>
);
