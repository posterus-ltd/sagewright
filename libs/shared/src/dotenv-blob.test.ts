import { describe, expect, it } from 'vitest';

import { RESERVED_ENV_KEYS, maskEnvBlob, parseEnvBlob } from './dotenv-blob';

describe('parseEnvBlob', () => {
  it('parses simple KEY=VALUE lines', () => {
    expect(parseEnvBlob('GITHUB_TOKEN=ghp_abc\nFOO=bar')).toEqual({
      GITHUB_TOKEN: 'ghp_abc',
      FOO: 'bar',
    });
  });

  it('skips blank lines and # comments', () => {
    expect(parseEnvBlob('\n# a comment\nFOO=bar\n   \n')).toEqual({ FOO: 'bar' });
  });

  it('strips surrounding matching quotes', () => {
    expect(parseEnvBlob(`A="quoted"\nB='single'\nC=plain`)).toEqual({
      A: 'quoted',
      B: 'single',
      C: 'plain',
    });
  });

  it('keeps = characters inside the value', () => {
    expect(parseEnvBlob('URL=postgres://u:p@h/db?a=b')).toEqual({
      URL: 'postgres://u:p@h/db?a=b',
    });
  });

  it('supports an export prefix and trims whitespace', () => {
    expect(parseEnvBlob('export FOO = bar')).toEqual({ FOO: 'bar' });
  });

  it('ignores lines without = or with an empty key', () => {
    expect(parseEnvBlob('NOEQUALS\n=novalue\nFOO=bar')).toEqual({ FOO: 'bar' });
  });

  it('last duplicate key wins', () => {
    expect(parseEnvBlob('FOO=1\nFOO=2')).toEqual({ FOO: '2' });
  });
});

describe('maskEnvBlob', () => {
  it('replaces each value with asterisks but keeps the key', () => {
    expect(maskEnvBlob('GITHUB_TOKEN=ghp_secret')).toBe('GITHUB_TOKEN=*******');
  });

  it('preserves comments and blank lines', () => {
    const input = '# header\n\nFOO=bar';
    expect(maskEnvBlob(input)).toBe('# header\n\nFOO=*******');
  });

  it('preserves the export prefix and leading indentation', () => {
    expect(maskEnvBlob('export FOO=bar')).toBe('export FOO=*******');
  });

  it('leaves empty values untouched', () => {
    expect(maskEnvBlob('FOO=')).toBe('FOO=');
  });

  it('leaves lines without = untouched', () => {
    expect(maskEnvBlob('not an assignment')).toBe('not an assignment');
  });
});

describe('RESERVED_ENV_KEYS', () => {
  it('contains the operational keys the spawner controls', () => {
    for (const k of ['WORKER_TOKEN', 'TASK_ID', 'CONTROL_PLANE_URL', 'SESSION_DIR', 'REPO_MANIFEST', 'PROMPT', 'SESSION_MODE']) {
      expect(RESERVED_ENV_KEYS.has(k)).toBe(true);
    }
  });
});
