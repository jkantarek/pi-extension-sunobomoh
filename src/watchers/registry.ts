import { createRegistry } from '../core/registry.js';
import type { Registry } from '../core/registry.js';
import type { BoundWatcher } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { Type } = await import('typebox');
 * const { unsafeWatcherId, unsafeTagId, toResourceUri, isOk } = await import('../core/brands.js');
 * const reg = createWatcherRegistry();
 * const watcher: BoundWatcher = {
 *   definition: {
 *     id: unsafeWatcherId('test-watcher'),
 *     name: 'Test',
 *     description: 'Test watcher',
 *     configSchema: Type.Object({}),
 *     watch: async () => [],
 *     extractUri: () => {
 *       const r = toResourceUri('file:///test');
 *       return isOk(r) ? r.value : (() => { throw new Error('Invalid URI'); })();
 *     },
 *     extractLabel: () => 'Test Label',
 *     extractTags: () => [unsafeTagId('informational')],
 *   },
 *   config: {},
 * };
 * reg.register(watcher);
 * expect(reg.has(unsafeWatcherId('test-watcher'))).toBe(true);
 * expect(reg.get(unsafeWatcherId('test-watcher'))).toBe(watcher);
 * expect(reg.getAll().length).toBe(1);
 * ```
 */
export const createWatcherRegistry = (): Registry<BoundWatcher> =>
  createRegistry<BoundWatcher>((w) => w.definition.id);
