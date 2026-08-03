import type Docker from 'dockerode';
import type { RunnerImage } from '@sagewright/shared';

type DockerImages = Pick<Docker, 'listImages'>;

interface RunnerRegistryDeps {
  docker: DockerImages;
}

export const createRunnerRegistry = (deps: RunnerRegistryDeps) => ({
  list: async (): Promise<RunnerImage[]> => {
    const images = await deps.docker.listImages({ filters: { label: ['sagewright.runner=true'] } });
    const seen = new Set<string>();
    const result: RunnerImage[] = [];
    for (const img of images) {
      const usable = (img.RepoTags ?? []).filter((t) => t !== '<none>:<none>');
      const tag = usable.find((t) => t.endsWith(':latest')) ?? usable[0] ?? null;
      if (!tag) continue;
      const labels = img.Labels ?? {};
      let id: string;
      const prefixMatch = tag.match(/^sagewright-runner-([^:]+):/);
      if (prefixMatch) {
        id = prefixMatch[1]!;
      } else {
        const labelName = labels['sagewright.runner.name'] ?? tag;
        id = labelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        image: tag,
        name: labels['sagewright.runner.name'] ?? id,
        description: labels['sagewright.runner.description'] ?? '',
      });
    }
    return result;
  },
});

export type RunnerRegistry = ReturnType<typeof createRunnerRegistry>;
