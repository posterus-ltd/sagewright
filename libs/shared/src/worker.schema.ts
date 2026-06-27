import { z } from 'zod';

/**
 * A worker Docker image the control plane can spawn sessions in. Discovered at runtime by
 * filtering images on the `sagewright.worker=true` label (see the worker registry).
 */
export const workerImageSchema = z.object({
  /** Stable id — the workers/<id> folder name, derived from the sagewright-worker-<id> repo tag. */
  id: z.string(),
  /** Full Docker image ref used as the container Image, e.g. `sagewright-worker-opencode:latest`. */
  image: z.string(),
  /** Human-readable name from the `sagewright.worker.name` label. */
  name: z.string(),
  /** Short description from the `sagewright.worker.description` label. */
  description: z.string(),
});

export type WorkerImage = z.infer<typeof workerImageSchema>;
