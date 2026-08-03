import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  // 32-char key for encrypting per-user env blobs at rest (aes-256-gcm).
  SECRETS_KEY: z.string().length(32),
  LINEAR_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  CONTROL_PLANE_URL: z.string().min(1),
  RUNNER_IMAGE: z.string().min(1),
  RUNNER_NETWORK: z.string().min(1).default('sage_default'),
  RUNNER_VOLUME: z.string().min(1).default('sagewright-repos'),
  PORT: z.coerce.number().default(3000),
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
});

export interface AppConfig {
  databaseUrl: string; appPassword: string; sessionSecret: string; secretsKey: string;
  linearApiKey?: string; githubToken?: string; controlPlaneUrl: string;
  runnerImage: string; runnerNetwork: string; runnerVolume: string; port: number;
  allowSessionDeletion: boolean;
  schedulerTimezone?: string;
}

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const c = configSchema.parse(env);
  return {
    databaseUrl: c.DATABASE_URL, appPassword: c.APP_PASSWORD, sessionSecret: c.SESSION_SECRET,
    secretsKey: c.SECRETS_KEY,
    linearApiKey: c.LINEAR_API_KEY, githubToken: c.GITHUB_TOKEN, controlPlaneUrl: c.CONTROL_PLANE_URL,
    runnerImage: c.RUNNER_IMAGE, runnerNetwork: c.RUNNER_NETWORK, runnerVolume: c.RUNNER_VOLUME, port: c.PORT,
    allowSessionDeletion: c.ALLOW_SESSION_DELETION === 'true',
    schedulerTimezone: c.SCHEDULER_TIMEZONE,
  };
};
