import type Docker from 'dockerode';
import type { WorkerImage } from '@sagewright/shared';

type DockerImages = Pick<Docker, 'listImages'>;

interface WorkerRegistryDeps {
  docker: DockerImages;
}

export const createWorkerRegistry = (deps: WorkerRegistryDeps) => ({
  list: async (): Promise<WorkerImage[]> => {
    const images = await deps.docker.listImages({ filters: { label: ['sagewright.worker=true'] } });
    const seen = new Set<string>();
    const result: WorkerImage[] = [];
    for (const img of images) {
      const usable = (img.RepoTags ?? []).filter((t) => t !== '<none>:<none>');
      const tag = usable.find((t) => t.endsWith(':latest')) ?? usable[0] ?? null;
      if (!tag) continue;
      const labels = img.Labels ?? {};
      let id: string;
      const prefixMatch = tag.match(/^sagewright-worker-([^:]+):/);
      if (prefixMatch) {
        id = prefixMatch[1];
      } else {
        const labelName = labels['sagewright.worker.name'] ?? tag;
        id = labelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        image: tag,
        name: labels['sagewright.worker.name'] ?? id,
        description: labels['sagewright.worker.description'] ?? '',
      });
    }
    return result;
  },
});

export type WorkerRegistry = ReturnType<typeof createWorkerRegistry>;
