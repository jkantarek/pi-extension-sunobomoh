import type { TSchema } from 'typebox/type';
import type { WatcherId, TagId, ResourceUri } from '../core/brands.js';
import type { HydratorDefinition } from '../hydrators/types.js';
import type { SideEffectDefinition } from '../side-effects/types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { Type } = await import('typebox');
 * const { unsafeWatcherId, unsafeTagId, toResourceUri, isOk } = await import('../core/brands.js');
 * const w: WatcherDefinition = {
 *   id: unsafeWatcherId('test'),
 *   name: 'Test',
 *   description: 'Test watcher',
 *   configSchema: Type.Object({}),
 *   watch: async () => [],
 *   extractUri: () => {
 *     const r = toResourceUri('file:///test');
 *     return isOk(r) ? r.value : (() => { throw new Error('Invalid URI'); })();
 *   },
 *   extractLabel: () => 'Test Label',
 *   extractTags: () => [unsafeTagId('informational')],
 * };
 * expect(w.id).toBe('test');
 * expect(w.name).toBe('Test');
 * ```
 */
export interface WatcherDefinition<TConfig = unknown, TEvent = unknown> {
  readonly id: WatcherId;
  readonly name: string;
  readonly description: string;
  readonly configSchema: TSchema;
  watch(config: TConfig, signal: AbortSignal): Promise<readonly TEvent[]>;
  extractUri(event: TEvent, config: TConfig): ResourceUri;
  extractLabel(event: TEvent, config: TConfig): string;
  extractTags(event: TEvent, config: TConfig): readonly TagId[];
  readonly hydrators?: readonly HydratorDefinition[];
  readonly sideEffects?: readonly SideEffectDefinition[];
}

export interface BoundWatcher<TConfig = unknown> {
  readonly definition: WatcherDefinition<TConfig>;
  readonly config: TConfig;
}
