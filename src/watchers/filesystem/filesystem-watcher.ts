import { Type } from 'typebox';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import type { WatcherDefinition } from '../types.js';
import type { TagId, ResourceUri } from '../../core/brands.js';
import { unsafeWatcherId, unsafeTagId, unsafeResourceUri } from '../../core/brands.js';

export interface FilesystemConfig {
  readonly path: string;
  readonly pattern?: string;
}

export interface FilesystemEvent {
  readonly path: string;
}

const match = (p: string, pat?: string): boolean => !pat || new RegExp(pat).test(p);

export const filesystemWatcher: WatcherDefinition<FilesystemConfig, FilesystemEvent> = {
  id: unsafeWatcherId('filesystem'),
  name: 'Filesystem Watcher',
  description: 'Watch filesystem paths for changes',
  configSchema: Type.Object({
    path: Type.String(),
    pattern: Type.Optional(Type.String()),
  }),
  watch: async (cfg): Promise<readonly FilesystemEvent[]> => {
    const entries = await readdir(cfg.path, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && match(e.name, cfg.pattern))
      .map((e) => ({
        path: `${cfg.path}/${e.name}`,
      }));
  },
  extractUri: (evt): ResourceUri => unsafeResourceUri(`file://${evt.path}`),
  extractLabel: (evt): string => basename(evt.path),
  extractTags: (): readonly TagId[] => [unsafeTagId('informational')],
};
