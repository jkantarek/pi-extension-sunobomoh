import type { BuiltinWatcherEntry } from '../config/types.js';
import { filesystemWatcher } from '../watchers/filesystem/filesystem-watcher.js';
import { githubWatcher } from '../watchers/github/github-watcher.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const bundle = createBuiltinWatcherBundle();
 * expect(bundle.size).toBe(2);
 * expect(bundle.has('filesystem')).toBe(true);
 * expect(bundle.has('github')).toBe(true);
 * const fsEntry = bundle.get('filesystem')!;
 * expect(fsEntry.id).toBe('filesystem');
 * expect(typeof fsEntry.definition.watch).toBe('function');
 * const ghEntry = bundle.get('github')!;
 * expect(ghEntry.id).toBe('github');
 * expect(typeof ghEntry.definition.watch).toBe('function');
 * ```
 */
/* eslint-disable max-lines-per-function -- Single-purpose factory assembling entries */
export function createBuiltinWatcherBundle(): ReadonlyMap<string, BuiltinWatcherEntry> {
  const entries: BuiltinWatcherEntry[] = [
    {
      id: 'filesystem',
      name: 'Filesystem Watcher',
      description: 'Watch filesystem paths for changes',
      definition: filesystemWatcher,
    },
    {
      id: 'github',
      name: 'GitHub Watcher',
      description: 'Watch GitHub issues',
      definition: githubWatcher,
    },
  ];
  return new Map(entries.map((entry) => [entry.id, entry] as const));
}
