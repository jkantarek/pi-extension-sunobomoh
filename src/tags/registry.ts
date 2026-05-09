import { createRegistry, type Registry } from '../core/registry.js';
import type { TagDefinition } from './types.js';
import { BUILTIN_TAGS } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const registry = createTagRegistry();
 * expect(registry.has('urgent' as any)).toBe(true);
 * expect(registry.has('needs-review' as any)).toBe(true);
 * expect(registry.has('informational' as any)).toBe(true);
 * expect(registry.has('stale' as any)).toBe(true);
 * const custom: TagDefinition = {
 *   id: 'custom' as any,
 *   label: 'Custom',
 *   description: 'Custom tag',
 *   defaultStatus: 'pending',
 *   outcomeSchema: {} as any,
 *   attentionWeight: 5,
 * };
 * registry.register(custom);
 * expect(registry.has('custom' as any)).toBe(true);
 * expect(registry.get('custom' as any)).toBe(custom);
 * ```
 */
export const createTagRegistry = (): Registry<TagDefinition> => {
  const registry = createRegistry<TagDefinition>((t) => t.id);
  for (const tag of BUILTIN_TAGS) {
    registry.register(tag);
  }
  return registry;
};
