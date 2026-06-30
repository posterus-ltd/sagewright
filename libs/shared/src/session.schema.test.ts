import { describe, expect, it } from 'vitest';
import { createScheduledPromptSchema, createSessionSchema, saveReposSchema } from './index';

describe('createSessionSchema', () => {
  it('accepts an empty body (friction-free interactive session)', () => {
    expect(createSessionSchema.parse({})).toEqual({});
  });

  it('accepts an optional prompt', () => {
    expect(createSessionSchema.parse({ prompt: 'fix bug' }).prompt).toBe('fix bug');
  });

  it('rejects an empty prompt string', () => {
    expect(() => createSessionSchema.parse({ prompt: '' })).toThrow();
  });
});

describe('saveReposSchema', () => {
  it('accepts a list of urls', () => {
    const parsed = saveReposSchema.parse({ urls: ['https://github.com/a/b', 'https://github.com/c/d'] });
    expect(parsed.urls).toHaveLength(2);
  });
});

describe('createScheduledPromptSchema', () => {
  it('defaults enabled to true', () => {
    expect(createScheduledPromptSchema.parse({ cron: '* * * * *', prompt: 'do it' }).enabled).toBe(true);
  });

  it('requires cron and prompt', () => {
    expect(() => createScheduledPromptSchema.parse({ cron: '', prompt: 'x' })).toThrow();
  });

  it('accepts an optional workerImage to pin which harness runs the task', () => {
    const parsed = createScheduledPromptSchema.parse({ cron: '* * * * *', prompt: 'do it', workerImage: 'sagewright-worker-codex:latest' });
    expect(parsed.workerImage).toBe('sagewright-worker-codex:latest');
  });

  it('omits workerImage when not provided (inherit the creator default)', () => {
    expect(createScheduledPromptSchema.parse({ cron: '* * * * *', prompt: 'do it' }).workerImage).toBeUndefined();
  });
});
