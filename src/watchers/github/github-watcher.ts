import { Type } from 'typebox';
import type { WatcherDefinition } from '../types.js';
import type { TagId, ResourceUri } from '../../core/brands.js';
import { unsafeWatcherId, unsafeResourceUri } from '../../core/brands.js';
import { mapLabelsToTags } from './label-map.js';

export interface GitHubConfig {
  readonly owner: string;
  readonly repo: string;
  readonly fetch?: typeof fetch;
}

export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly labels: readonly { readonly name: string }[];
}

const fetchIssues = async (
  cfg: GitHubConfig,
  sig: AbortSignal,
): Promise<readonly GitHubIssue[]> => {
  const fn = cfg.fetch ?? globalThis.fetch;
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/issues`;
  const res = await fn(url, { signal: sig });
  if (!res.ok) return [];
  return (await res.json()) as GitHubIssue[];
};

export const githubWatcher: WatcherDefinition<GitHubConfig, GitHubIssue> = {
  id: unsafeWatcherId('github'),
  name: 'GitHub Watcher',
  description: 'Watch GitHub issues',
  configSchema: Type.Object({
    owner: Type.String(),
    repo: Type.String(),
    fetch: Type.Optional(Type.Any()),
  }),
  watch: async (cfg, sig): Promise<readonly GitHubIssue[]> => fetchIssues(cfg, sig),
  extractUri: (evt, cfg): ResourceUri =>
    unsafeResourceUri(`github:///${cfg.owner}/${cfg.repo}/issues/${String(evt.number)}`),
  extractLabel: (evt): string => `#${String(evt.number)}: ${evt.title}`,
  extractTags: (evt): readonly TagId[] => mapLabelsToTags(evt.labels.map((l) => l.name)),
};
