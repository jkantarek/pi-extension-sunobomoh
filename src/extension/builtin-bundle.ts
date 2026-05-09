import { Type } from 'typebox';
import type { BuiltinWatcherEntry } from '../config/types.js';
import type { WatcherDefinition } from '../watchers/types.js';
import { unsafeWatcherId, unsafeTagId, unsafeResourceUri } from '../core/brands.js';
import type { ResourceUri } from '../core/brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const bundle = createBuiltinWatcherBundle();
 * expect(bundle.size).toBeGreaterThan(0);
 * expect(bundle.has('filesystem')).toBe(true);
 * const fsEntry = bundle.get('filesystem')!;
 * expect(fsEntry.id).toBe('filesystem');
 * expect(typeof fsEntry.definition.watch).toBe('function');
 * ```
 */
/* eslint-disable max-lines-per-function -- Single-purpose factory assembling entries */
export function createBuiltinWatcherBundle(): ReadonlyMap<string, BuiltinWatcherEntry> {
  const entries: BuiltinWatcherEntry[] = [
    {
      id: 'filesystem',
      name: 'Filesystem Watcher',
      description: 'Watch filesystem paths for changes',
      definition: createFilesystemWatcherDefinition(),
    },
  ];
  return new Map(entries.map((entry) => [entry.id, entry] as const));
}

/* eslint-disable max-lines-per-function -- WatcherDefinition initialization */
function createFilesystemWatcherDefinition(): WatcherDefinition {
  return {
    id: unsafeWatcherId('filesystem'),
    name: 'Filesystem Watcher',
    description: 'Watch filesystem paths for changes',
    configSchema: Type.Object({ paths: Type.Array(Type.String()) }),
    watch: (): Promise<readonly unknown[]> => Promise.resolve([]),
    extractUri: (): ResourceUri => unsafeResourceUri('file:///placeholder'),
    extractLabel: (): string => 'Placeholder',
    extractTags: () => [unsafeTagId('informational')],
  };
}
