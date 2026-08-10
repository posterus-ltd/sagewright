import { z } from 'zod';

const configSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    // Initial password of the seeded `root` account (forced to change on first login).
    ROOT_PASSWORD: z.string().min(1).optional(),
    // Deprecated alias for ROOT_PASSWORD, honored one release so existing deploys keep
    // booting after the rename. Remove once every deployment has migrated.
    APP_PASSWORD: z.string().min(1).optional(),
    SESSION_SECRET: z.string().min(1),
    // 32-char key for encrypting per-user env blobs at rest (aes-256-gcm).
    SECRETS_KEY: z.string().length(32),
    GITHUB_TOKEN: z.string().optional(),
    RUNNER_IMAGE: z.string().min(1),
    // Image no-agent shell/CLI widget sessions (spawn_shell) run on — a basic box with
    // tmux + common CLI tools and no harness. Defaults to the bundled `shell` runner.
    CLI_RUNNER_IMAGE: z.string().min(1).default('sagewright-runner-shell:latest'),
    RUNNER_NETWORK: z.string().min(1).default('sage_default'),
    RUNNER_VOLUME: z.string().min(1).default('sagewright-repos'),
    PORT: z.coerce.number().default(3001),
    // Advertised URL of the /mcp endpoint, injected into every runner as
    // SAGEWRIGHT_MCP_URL so an agent's harness knows where to reach it. Defaults to the
    // in-cluster Docker-DNS address (runners share the `sagewright` network); override
    // only if the control plane is reachable at a different internal host/port.
    MCP_PUBLIC_URL: z.string().min(1).default('http://control-plane:3001/mcp'),
    // Whether sessions may be permanently deleted after archiving. Deployments that
    // must retain session history for auditing set 'false' — archiving keeps working,
    // but DELETE /api/tasks/:id is refused. Strict 'true'/'false' so a typo fails at
    // boot instead of silently re-enabling deletion.
    ALLOW_SESSION_DELETION: z.enum(['true', 'false']).default('true'),
    // IANA timezone cron expressions are evaluated in (e.g. 'Europe/Sofia').
    // Unset → server-local time (UTC in the container). Validated up front: a typo
    // silently reverting every schedule to UTC is the failure mode to avoid.
    SCHEDULER_TIMEZONE: z
      .string()
      .optional()
      .refine(
        (tz) => {
          if (tz === undefined) return true;
          try {
            new Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        },
        { message: 'SCHEDULER_TIMEZONE must be a valid IANA timezone' },
      ),
  })
  // One of ROOT_PASSWORD (preferred) or APP_PASSWORD (legacy) must be set.
  .refine((c) => Boolean(c.ROOT_PASSWORD ?? c.APP_PASSWORD), {
    message: 'ROOT_PASSWORD is required',
    path: ['ROOT_PASSWORD'],
  });

export interface AppConfig {
  databaseUrl: string;
  rootPassword: string;
  sessionSecret: string;
  secretsKey: string;
  githubToken?: string;
  runnerImage: string;
  cliRunnerImage: string;
  runnerNetwork: string;
  runnerVolume: string;
  port: number;
  mcpPublicUrl: string;
  allowSessionDeletion: boolean;
  schedulerTimezone?: string;
}

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const c = configSchema.parse(env);
  return {
    databaseUrl: c.DATABASE_URL,
    // The refine above guarantees at least one is present.
    rootPassword: (c.ROOT_PASSWORD ?? c.APP_PASSWORD)!,
    sessionSecret: c.SESSION_SECRET,
    secretsKey: c.SECRETS_KEY,
    githubToken: c.GITHUB_TOKEN,
    runnerImage: c.RUNNER_IMAGE,
    cliRunnerImage: c.CLI_RUNNER_IMAGE,
    runnerNetwork: c.RUNNER_NETWORK,
    runnerVolume: c.RUNNER_VOLUME,
    port: c.PORT,
    mcpPublicUrl: c.MCP_PUBLIC_URL,
    allowSessionDeletion: c.ALLOW_SESSION_DELETION === 'true',
    schedulerTimezone: c.SCHEDULER_TIMEZONE,
  };
};
