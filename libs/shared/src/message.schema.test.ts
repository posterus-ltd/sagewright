import { describe, expect, it } from 'vitest';
import { inboundMessageSchema, postMessageSchema } from './index';

describe('inboundMessageSchema', () => {
  it('accepts a valid message', () => {
    const parsed = inboundMessageSchema.parse({ id: 'm1', body: 'hello' });
    expect(parsed.id).toBe('m1');
    expect(parsed.body).toBe('hello');
  });
});

describe('postMessageSchema', () => {
  it('rejects an empty body', () => {
    expect(() => postMessageSchema.parse({ body: '' })).toThrow();
  });
});
