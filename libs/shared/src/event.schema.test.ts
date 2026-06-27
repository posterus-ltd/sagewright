import { describe, expect, it } from 'vitest';
import { EventType, streamEventSchema, ingestEventSchema } from './index';

describe('streamEventSchema', () => {
  it('accepts a valid event', () => {
    const input = {
      seq: 0,
      type: EventType.LOG,
      payload: { line: 'hi' },
      createdAt: '2026-01-01T00:00:00Z',
    };
    const parsed = streamEventSchema.parse(input);
    expect(parsed.seq).toBe(0);
    expect(parsed.type).toBe(EventType.LOG);
    expect(parsed.payload).toEqual({ line: 'hi' });
    expect(parsed.createdAt).toBe('2026-01-01T00:00:00Z');
  });

  it('rejects a negative seq', () => {
    expect(() =>
      streamEventSchema.parse({
        seq: -1,
        type: EventType.LOG,
        payload: {},
        createdAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });
});

describe('ingestEventSchema', () => {
  it('accepts a valid ingest event and round-trips arbitrary payload', () => {
    const payload = { text: 'x', nested: { count: 42 }, flag: true };
    const parsed = ingestEventSchema.parse({ type: EventType.ASSISTANT, payload });
    expect(parsed.type).toBe(EventType.ASSISTANT);
    expect(parsed.payload).toEqual(payload);
  });
});
