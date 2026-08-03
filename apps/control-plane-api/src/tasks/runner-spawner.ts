import Docker from 'dockerode';

import { VOLUME_ROOT, type RepoManifestEntry, type SessionMode } from '@sagewright/shared';
import type { AppConfig } from '../config';

export interface SpawnInput {
  taskId: string;
  mode: SessionMode;
  prompt?: string;
  manifest: RepoManifestEntry[];
  sessionDir: string;
  // Per-user env overriding the image's baked-in org secrets. Operational vars
  // below always win (reserved keys are already stripped by the task service).
  userEnv: Record<string, string>;
  // Optional per-session image override; falls back to the config default.
  runnerImage?: string;
}

type DockerLike = Pick<Docker, 'createContainer' | 'getContainer'>;
type DockerFactory = () => DockerLike;

/** Docker label tying every spawned container to its session/run id — the only
 *  handle for a box whose containerId never reached the DB (crash mid-spawn) or
 *  that has no session row at all (a workflow run's ops container). */
export const SESSION_LABEL = 'sagewright.session';

const toEnvArray = (record: Record<string, string>): string[] =>
  Object.entries(record).map(([k, v]) => `${k}=${v}`);

export const createRunnerSpawner = (config: AppConfig, dockerFactory: DockerFactory = () => new Docker()) => {
  const docker = dockerFactory();
  return {
    spawn: async (input: SpawnInput): Promise<{ containerId: string }> => {
      // The runner is a generic box: it just comes up (keep-alive ENTRYPOINT) and the
      // control plane execs its predefined start script. We inject the run context the
      // start script reads (PROMPT, cwd hints) plus harness creds — no callback token or
      // control-plane URL, since the control plane drives the agent over `docker exec`.
      const operationalEnv = {
        TASK_ID: input.taskId,
        SESSION_DIR: input.sessionDir,
        REPO_MANIFEST: JSON.stringify(input.manifest),
        PROMPT: input.prompt ?? '',
        SESSION_MODE: input.mode,
      };
      // Layering: image ENV (org base) < userEnv < operationalEnv. The container
      // Env array overrides the image's baked ENV, and operational vars win last.
      const env = { ...input.userEnv, ...operationalEnv };
      const container = await docker.createContainer({
        Image: input.runnerImage ?? config.runnerImage,
        Env: toEnvArray(env),
        Labels: { [SESSION_LABEL]: input.taskId },
        Tty: false,
        HostConfig: {
          NetworkMode: config.runnerNetwork,
          // Mount the shared repo volume at the SAME path the control-plane uses,
          // so worktree gitdir links (absolute paths) resolve inside the runner.
          Binds: [`${config.runnerVolume}:${VOLUME_ROOT}`],
        },
      });
      await container.start();
      return { containerId: container.id };
    },
    retire: async (containerId: string): Promise<void> => {
      await docker.getContainer(containerId).remove({ force: true }).catch(() => undefined);
    },
  };
};
