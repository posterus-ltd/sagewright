import { describe, expect, it } from 'vitest';
import { createScheduledPromptSchema, createSessionSchema, createShellSessionSchema, saveReposSchema, sessionLabel } from './index';

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

describe('createShellSessionSchema', () => {
  it('requires a non-empty command', () => {
    expect(createShellSessionSchema.parse({ command: 'watch -n1 date' }).command).toBe('watch -n1 date');
    expect(() => createShellSessionSchema.parse({ command: '' })).toThrow();
    expect(() => createShellSessionSchema.parse({})).toThrow();
  });
});

describe('sessionLabel', () => {
  it('prefers the name, then the prompt, then the shell command, then a fallback', () => {
    expect(sessionLabel({ name: 'My widget', prompt: 'ignored', command: 'ignored' })).toBe('My widget');
    expect(sessionLabel({ name: null, prompt: 'fix the bug' })).toBe('fix the bug');
    // A shell widget has no prompt — fall back to its command.
    expect(sessionLabel({ name: null, prompt: null, command: 'watch -n1 date' })).toBe('watch -n1 date');
    expect(sessionLabel({ name: null, prompt: null })).toBe('Interactive session');
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

  it('accepts an optional runnerImage to pin which harness runs the task', () => {
    const parsed = createScheduledPromptSchema.parse({ cron: '* * * * *', prompt: 'do it', runnerImage: 'sagewright-runner-codex:latest' });
    expect(parsed.runnerImage).toBe('sagewright-runner-codex:latest');
  });

  it('omits runnerImage when not provided (inherit the creator default)', () => {
    expect(createScheduledPromptSchema.parse({ cron: '* * * * *', prompt: 'do it' }).runnerImage).toBeUndefined();
  });
});
