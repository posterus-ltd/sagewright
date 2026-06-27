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
  WORKER_IMAGE: z.string().min(1),
  WORKER_NETWORK: z.string().min(1).default('sage_default'),
  WORKER_VOLUME: z.string().min(1).default('sagewright-repos'),
  PORT: z.coerce.number().default(3000),
});

export interface AppConfig {
  databaseUrl: string; appPassword: string; sessionSecret: string; secretsKey: string;
  linearApiKey?: string; githubToken?: string; controlPlaneUrl: string;
  workerImage: string; workerNetwork: string; workerVolume: string; port: number;
}

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const c = configSchema.parse(env);
  return {
    databaseUrl: c.DATABASE_URL, appPassword: c.APP_PASSWORD, sessionSecret: c.SESSION_SECRET,
    secretsKey: c.SECRETS_KEY,
    linearApiKey: c.LINEAR_API_KEY, githubToken: c.GITHUB_TOKEN, controlPlaneUrl: c.CONTROL_PLANE_URL,
    workerImage: c.WORKER_IMAGE, workerNetwork: c.WORKER_NETWORK, workerVolume: c.WORKER_VOLUME, port: c.PORT,
  };
};
