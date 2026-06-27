import { describe, expect, it } from 'vitest';

import {
  BORDER_COLOR_PALETTE,
  borderColorAt,
  distinctBorderColors,
  effectiveBorderColor,
  glowColor,
  pickRandomBorderColor,
} from './border-colors';

describe('BORDER_COLOR_PALETTE', () => {
  it('is a non-empty set of distinct hex colors', () => {
    expect(BORDER_COLOR_PALETTE.length).toBeGreaterThanOrEqual(8);
    expect(new Set(BORDER_COLOR_PALETTE).size).toBe(BORDER_COLOR_PALETTE.length);
    for (const c of BORDER_COLOR_PALETTE) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('borderColorAt', () => {
  it('wraps around the palette by modulo', () => {
    expect(borderColorAt(0)).toBe(BORDER_COLOR_PALETTE[0]);
    expect(borderColorAt(BORDER_COLOR_PALETTE.length)).toBe(BORDER_COLOR_PALETTE[0]);
    expect(borderColorAt(BORDER_COLOR_PALETTE.length + 1)).toBe(BORDER_COLOR_PALETTE[1]);
  });

  it('wraps negative indices to the end of the palette', () => {
    expect(borderColorAt(-1)).toBe(BORDER_COLOR_PALETTE[BORDER_COLOR_PALETTE.length - 1]);
  });
});

describe('pickRandomBorderColor', () => {
  it('returns a color from the palette', () => {
    for (let i = 0; i < 50; i++) {
      expect(BORDER_COLOR_PALETTE).toContain(pickRandomBorderColor());
    }
  });
});

describe('distinctBorderColors', () => {
  it('dedupes defined colors preserving first-seen order', () => {
    expect(distinctBorderColors(['#aaa', '#bbb', '#aaa', '#ccc'])).toEqual(['#aaa', '#bbb', '#ccc']);
  });

  it('drops undefined and empty values', () => {
    expect(distinctBorderColors([undefined, '#aaa', '', '#aaa'])).toEqual(['#aaa']);
  });
});

describe('effectiveBorderColor', () => {
  it('returns the custom color when set', () => {
    expect(effectiveBorderColor('#3fb950')).toBe('#3fb950');
  });

  it('falls back to the divider token when unset', () => {
    expect(effectiveBorderColor(undefined)).toBe('divider');
  });
});

describe('glowColor', () => {
  it('uses the custom color when set', () => {
    expect(glowColor('#3fb950', '#fallback')).toBe('#3fb950');
  });

  it('uses the fallback when no custom color is set', () => {
    expect(glowColor(undefined, '#fallback')).toBe('#fallback');
  });
});
