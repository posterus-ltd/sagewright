import { fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LandingPage } from './LandingPage';

const renderPage = () => render(<LandingPage />);

describe('LandingPage', () => {
  // The decorative AsciiField mounts a <canvas>; jsdom has no 2D context, so we
  // stub getContext to keep it a graceful no-op (and silence jsdom warnings).
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Sagewright wordmark banner', () => {
    const { getByLabelText } = renderPage();
    expect(getByLabelText('Sagewright')).toBeTruthy();
  });

  it('showcases the product with framed screenshots', () => {
    const { getByAltText } = renderPage();
    const hero = getByAltText(
      /control plane in the browser/i,
    ) as HTMLImageElement;
    expect(hero.tagName).toBe('IMG');
    expect(hero.getAttribute('src')).toBe('/screenshots/canvas.png');
    expect(getByAltText(/opencode harness/i)).toBeTruthy();
    expect(getByAltText(/Galaxy view/i)).toBeTruthy();
    expect(getByAltText(/visual workflow builder/i)).toBeTruthy();
    expect(getByAltText(/Edit scheduled task/i)).toBeTruthy();
    expect(
      getByAltText(/docker ps listing the running Sagewright fleet/i),
    ).toBeTruthy();
  });

  it('frames the product as a higher-order harness orchestrating harnesses', () => {
    const { getByText } = renderPage();
    expect(getByText(/higher-order harness/i)).toBeTruthy();
    expect(getByText(/a harness that\s+orchestrates harnesses/i)).toBeTruthy();
  });

  it('points the CTA at the open-source repo', () => {
    const { getByText } = renderPage();
    const cta = getByText('❯ open source — try it now') as HTMLAnchorElement;
    expect(cta.tagName).toBe('A');
    expect(cta.getAttribute('href')).toBe(
      'https://github.com/posterus-ltd/sagewright',
    );
  });

  it('describes the work → validate → reflect loop', () => {
    const { getByText } = renderPage();
    expect(getByText(/self-correcting agents/i)).toBeTruthy();
  });

  it('offers the enterprise AI-native SDLC to small teams and solo builders', () => {
    const { getByText, getAllByText } = renderPage();
    expect(
      getByText(/within reach of small teams and solo builders/i),
    ).toBeTruthy();
    expect(getAllByText(/AI-native SDLC/i)).toHaveLength(2);
  });

  it('ranks audiences, placing the three sweet spots and flanking weaker fits', () => {
    const { getByText } = renderPage();
    expect(getByText(/who is it for\?/i)).toBeTruthy();
    // The sweet spot is a contiguous band of three audiences.
    expect(getByText(/technical ninjas — sweet spot №1/i)).toBeTruthy();
    expect(getByText(/small teams — sweet spot №2/i)).toBeTruthy();
    expect(getByText(/tech-driven enterprises — sweet spot №3/i)).toBeTruthy();
    // Flanked by weaker fits: vibe coders (only if technical) and broad enterprise.
    expect(getByText(/vibe coders — only if you are technical/i)).toBeTruthy();
    expect(getByText(/broader enterprise — a strong multiplier/i)).toBeTruthy();
  });

  it('links the hero bounce line to the is-it-for-you checklist', () => {
    const { getByText, container } = renderPage();
    const link = getByText('check here') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#is-it-for-you');
    expect(container.querySelector('#is-it-for-you')).toBeTruthy();
  });

  it('offers a self-qualifying checklist for whether Sagewright is for you', () => {
    const { getByText } = renderPage();
    expect(getByText(/is it for you\?/i)).toBeTruthy();
    expect(
      getByText(/run agents in the background, 24\/7, on remote infra/i),
    ).toBeTruthy();
    expect(getByText(/run multiple agents in isolated sandboxes/i)).toBeTruthy();
    expect(getByText(/run a docker-compose stack/i)).toBeTruthy();
    expect(
      getByText(/you definitely need to try sagewright/i),
    ).toBeTruthy();
  });

  it('describes scheduled, recurring tasks that run on a cron', () => {
    const { getByText } = renderPage();
    expect(getByText(/scheduled, recurring agents/i)).toBeTruthy();
    expect(getByText(/put routine work on a cron/i)).toBeTruthy();
  });

  it('explains the runner-container security model', () => {
    const { getByText } = renderPage();
    expect(getByText(/security by isolation/i)).toBeTruthy();
    expect(getByText(/sandboxed runner container/i)).toBeTruthy();
    expect(getByText(/only sees whatever you mount as its work tree/i)).toBeTruthy();
  });

  it('pitches extensibility through custom runners and the coming marketplace', () => {
    const { getByText } = renderPage();
    expect(getByText(/extensible by design/i)).toBeTruthy();
    expect(
      getByText(/creating a\s+custom runner/i),
    ).toBeTruthy();
    // The runners/ tree shows the built-in harnesses plus the extension slot.
    expect(getByText(/your-harness\//)).toBeTruthy();
    expect(getByText(/runner marketplace — coming soon/i)).toBeTruthy();
  });

  it('promises no vendor lock-in', () => {
    const { getByText } = renderPage();
    expect(getByText(/no vendor lock-in/i)).toBeTruthy();
  });

  describe('hero screenshot lightbox', () => {
    const enlarge = (result: ReturnType<typeof render>, addr: RegExp) => {
      fireEvent.click(
        result.getByRole('button', {
          name: new RegExp(`enlarge screenshot.*${addr.source}`, 'i'),
        }),
      );
    };
    const openFirst = () => {
      const result = renderPage();
      enlarge(result, /app\.sagewright\.dev\/fleet/);
      return result;
    };
    const enlargedSrc = (result: ReturnType<typeof render>) =>
      (
        within(result.getByRole('dialog')).getByRole('img') as HTMLImageElement
      ).getAttribute('src');

    it('opens an enlarged view of the clicked screenshot', () => {
      const result = openFirst();
      expect(result.getByRole('dialog')).toBeTruthy();
      expect(enlargedSrc(result)).toBe('/screenshots/canvas.png');
    });

    it('closes the enlarged view on Escape', () => {
      const { getByRole, queryByRole } = openFirst();
      expect(getByRole('dialog')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(queryByRole('dialog')).toBeNull();
    });

    it('closes when the backdrop is clicked', () => {
      const { getByRole, queryByRole } = openFirst();
      fireEvent.click(getByRole('dialog'));
      expect(queryByRole('dialog')).toBeNull();
    });

    it('steps to the next screenshot and wraps past the ends', () => {
      const result = openFirst();
      fireEvent.click(result.getByRole('button', { name: /next screenshot/i }));
      expect(enlargedSrc(result)).toBe('/screenshots/work-galaxy.png');
      // Two steps back from work-galaxy.png wraps around to the last shot.
      const prev = () =>
        fireEvent.click(
          result.getByRole('button', { name: /previous screenshot/i }),
        );
      prev();
      prev();
      expect(enlargedSrc(result)).toBe('/screenshots/docker-ps.png');
    });

    it('navigates with the arrow keys', () => {
      const result = openFirst();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(enlargedSrc(result)).toBe('/screenshots/work-galaxy.png');
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(enlargedSrc(result)).toBe('/screenshots/canvas.png');
    });

    it('does not open the lightbox after a drag across the gallery', () => {
      const { getByRole, queryByRole } = renderPage();
      const gallery = getByRole('group', { name: /product screenshots/i });
      fireEvent.pointerDown(gallery, {
        pointerType: 'mouse',
        clientX: 240,
        pointerId: 1,
      });
      fireEvent.pointerMove(gallery, {
        pointerType: 'mouse',
        clientX: 80,
        pointerId: 1,
      });
      fireEvent.pointerUp(gallery, {
        pointerType: 'mouse',
        clientX: 80,
        pointerId: 1,
      });
      fireEvent.click(
        getByRole('button', {
          name: /enlarge screenshot.*app\.sagewright\.dev\/fleet/i,
        }),
      );
      expect(queryByRole('dialog')).toBeNull();
    });
  });
});
