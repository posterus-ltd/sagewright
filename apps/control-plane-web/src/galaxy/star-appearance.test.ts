import { SessionStatus } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { dark, light } from '../theme/tokens';
import {
  isActiveStatus,
  MIN_STAR_OPACITY,
  pulsePeriodMs,
  starColor,
  starEmphasis,
  starOpacity,
  starSize,
} from './star-appearance';

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

describe('starOpacity', () => {
  const NOW = Date.parse('2026-07-01T00:00:00.000Z');
  const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();
  const settled = (createdAt: string, endedAt: string | null = null) => ({
    status: SessionStatus.DONE,
    createdAt,
    endedAt,
  });

  it('renders emphasized stars (in-flight or needs-assistance) at full brightness, whatever their age', () => {
    const old = { createdAt: daysAgo(120), endedAt: null };
    expect(starOpacity({ ...old, status: SessionStatus.RUNNING }, NOW)).toBe(1);
    expect(starOpacity({ ...old, status: SessionStatus.NEEDS_ASSISTANCE }, NOW)).toBe(1);
  });

  it('renders a just-settled star at full brightness and fades it as it ages', () => {
    expect(starOpacity(settled(daysAgo(0)), NOW)).toBe(1);
    const week = starOpacity(settled(daysAgo(7)), NOW);
    const month = starOpacity(settled(daysAgo(30)), NOW);
    expect(week).toBeLessThan(1);
    expect(month).toBeLessThan(week);
  });

  it('never fades below the floor — old stars stay visible, just dim', () => {
    expect(starOpacity(settled(daysAgo(500)), NOW)).toBe(MIN_STAR_OPACITY);
  });

  it('fades from when the work ended, not when it started', () => {
    const longRun = settled(daysAgo(90), daysAgo(0));
    expect(starOpacity(longRun, NOW)).toBe(1);
  });
});

describe('pulsePeriodMs', () => {
  it('pulses needs-assistance stars faster than in-flight ones — a stuck task is the urgent signal', () => {
    expect(pulsePeriodMs(SessionStatus.NEEDS_ASSISTANCE)!).toBeLessThan(pulsePeriodMs(SessionStatus.RUNNING)!);
  });

  it('gives settled stars no pulse at all', () => {
    expect(pulsePeriodMs(SessionStatus.DONE)).toBeNull();
    expect(pulsePeriodMs(SessionStatus.DETACHED)).toBeNull();
  });
});
