// Parsing and masking for the per-user custom `.env` blob that the control-plane
// injects into a runner container at spawn time. The blob is authored by a user in
// Settings, persisted encrypted, and overrides the org secrets baked into the image.

// Operational vars the spawner owns. These must never be overridable by a user's
// blob (a malicious value could hijack the runner token or repoint the control plane),
// so the spawner strips them from the parsed user env before merging.
export const RESERVED_ENV_KEYS = new Set<string>([
  'RUNNER_TOKEN',
  'TASK_ID',
  'CONTROL_PLANE_URL',
  'SESSION_DIR',
  'REPO_MANIFEST',
  'PROMPT',
  'SESSION_MODE',
]);

// `KEY` (optionally `export KEY`) up to the first `=`, capturing key and value.
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

const stripQuotes = (raw: string): string => {
  const v = raw.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1);
  }
  return v;
};

/** Parse a `.env` blob into a record. Blank lines, `#` comments, and malformed
 *  lines are ignored; surrounding quotes are stripped; last duplicate key wins. */
export const parseEnvBlob = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = ASSIGNMENT.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (key === undefined) continue;
    out[key] = stripQuotes(rawValue ?? '');
  }
  return out;
};

/** Render a `.env` blob with every value after `=` replaced by `*******`, preserving
 *  keys, the `export` prefix, indentation, comments, and blank lines. Empty values
 *  (`KEY=`) are left as-is since there is nothing to hide. */
export const maskEnvBlob = (text: string): string =>
  text
    .split('\n')
    .map((line) => {
      const m = ASSIGNMENT.exec(line);
      if (!m || (m[2] ?? '').trim() === '') return line;
      const eq = line.indexOf('=');
      return `${line.slice(0, eq + 1)}*******`;
    })
    .join('\n');
