import { SessionStatus } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { dark, light } from '../theme/tokens';
import { isActiveStatus, starColor, starEmphasis, starSize } from './star-appearance';

describe('starColor', () => {
  it('maps done to the palette success color', () => {
    expect(starColor(SessionStatus.DONE, dark)).toBe(dark.success);
    expect(starColor(SessionStatus.DONE, light)).toBe(light.success);
  });

  it('maps failed and stopped to the palette error color', () => {
    expect(starColor(SessionStatus.FAILED, dark)).toBe(dark.error);
    expect(starColor(SessionStatus.STOPPED, dark)).toBe(dark.error);
  });

  it('maps needs_assistance and max_iterations to the palette warning color', () => {
    expect(starColor(SessionStatus.NEEDS_ASSISTANCE, dark)).toBe(dark.warning);
    expect(starColor(SessionStatus.MAX_ITERATIONS, dark)).toBe(dark.warning);
  });

  it('maps active states (queued/provisioning/running/pushing) to the palette info color', () => {
    for (const status of [SessionStatus.QUEUED, SessionStatus.PROVISIONING, SessionStatus.RUNNING, SessionStatus.PUSHING]) {
      expect(starColor(status, dark)).toBe(dark.info);
    }
  });

  it('maps detached to the palette muted color', () => {
    expect(starColor(SessionStatus.DETACHED, dark)).toBe(dark.muted);
  });
});

describe('isActiveStatus', () => {
  it('is true for statuses where the agent is still working', () => {
    expect(isActiveStatus(SessionStatus.RUNNING)).toBe(true);
    expect(isActiveStatus(SessionStatus.QUEUED)).toBe(true);
    expect(isActiveStatus(SessionStatus.PROVISIONING)).toBe(true);
    expect(isActiveStatus(SessionStatus.PUSHING)).toBe(true);
  });

  it('is false for terminal or detached statuses', () => {
    expect(isActiveStatus(SessionStatus.DONE)).toBe(false);
    expect(isActiveStatus(SessionStatus.FAILED)).toBe(false);
    expect(isActiveStatus(SessionStatus.DETACHED)).toBe(false);
  });
});

describe('starEmphasis', () => {
  it('is true for statuses that should draw the eye: still-active work and needs-assistance', () => {
    expect(starEmphasis(SessionStatus.RUNNING)).toBe(true);
    expect(starEmphasis(SessionStatus.NEEDS_ASSISTANCE)).toBe(true);
  });

  it('is false for settled statuses (terminal or detached)', () => {
    expect(starEmphasis(SessionStatus.DONE)).toBe(false);
    expect(starEmphasis(SessionStatus.FAILED)).toBe(false);
    expect(starEmphasis(SessionStatus.DETACHED)).toBe(false);
  });
});

describe('starSize', () => {
  it('renders hub (workflow parent) nodes larger than standard nodes', () => {
    expect(starSize(true)).toBeGreaterThan(starSize(false));
  });
});
