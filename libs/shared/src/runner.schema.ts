import { z } from 'zod';

/**
 * A runner Docker image the control plane can spawn sessions in. Discovered at runtime by
 * filtering images on the `sagewright.runner=true` label (see the runner registry).
 */
export const runnerImageSchema = z.object({
  /** Stable id — the runners/<id> folder name, derived from the sagewright-runner-<id> repo tag. */
  id: z.string(),
  /** Full Docker image ref used as the container Image, e.g. `sagewright-runner-opencode:latest`. */
  image: z.string(),
  /** Human-readable name from the `sagewright.runner.name` label. */
  name: z.string(),
  /** Short description from the `sagewright.runner.description` label. */
  description: z.string(),
});

export type RunnerImage = z.infer<typeof runnerImageSchema>;
