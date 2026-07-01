import { describe, expect, it } from 'vitest';

import { RECONNECT_MAX_MS, nextReconnectDelay } from './reconnect';

describe('nextReconnectDelay', () => {
  it('backs off exponentially from the base delay', () => {
    expect(nextReconnectDelay(0)).toBe(500);
    expect(nextReconnectDelay(1)).toBe(1000);
    expect(nextReconnectDelay(2)).toBe(2000);
    expect(nextReconnectDelay(4)).toBe(8000);
  });

  it('caps at the max delay', () => {
    expect(nextReconnectDelay(5)).toBe(RECONNECT_MAX_MS);
    expect(nextReconnectDelay(50)).toBe(RECONNECT_MAX_MS);
  });
});
