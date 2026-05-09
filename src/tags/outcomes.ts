import type { TagDefinition } from './types.js';
import type { TagId } from '../core/brands.js';
import type { Registry } from '../core/registry.js';
import type { TagOutcome } from '../state/types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { UNKNOWN_OUTCOME_SCHEMA } = await import('./types.js');
 * const def: TagDefinition = {
 *   id: 'test' as any,
 *   label: 'Test',
 *   description: 'Test tag',
 *   defaultStatus: 'pending',
 *   outcomeSchema: UNKNOWN_OUTCOME_SCHEMA,
 *   attentionWeight: 5,
 * };
 * const outcome = createTagOutcome(def);
 * expect(outcome.tagId).toBe('test');
 * expect(outcome.status).toBe('pending');
 * expect(outcome.outcome).toBeUndefined();
 * expect(outcome.resolvedAt).toBeUndefined();
 * expect(outcome.notes).toBeUndefined();
 * ```
 */
export const createTagOutcome = (def: TagDefinition): TagOutcome => ({
  tagId: def.id,
  status: def.defaultStatus,
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const { createTagRegistry } = await import('./registry.js');
 * const reg = createTagRegistry();
 * const out = initializeOutcomes(['urgent' as any, 'stale' as any], reg);
 * expect(out.size).toBe(2);
 * expect(out.get('urgent' as any)?.status).toBe('active');
 * expect(initializeOutcomes(['unknown' as any], reg).size).toBe(1);
 * const { createRegistry } = await import('../core/registry.js');
 * const empty = createRegistry<TagDefinition>((d) => d.id);
 * expect(initializeOutcomes(['test' as any], empty).size).toBe(0);
 * ```
 */
export const initializeOutcomes = (
  tagIds: readonly TagId[],
  registry: Registry<TagDefinition>,
): ReadonlyMap<TagId, TagOutcome> => {
  const fallback = registry.getAll()[0];
  if (!fallback) return new Map();
  return new Map(
    tagIds.map((id) => [id, { ...createTagOutcome(registry.get(id) ?? fallback), tagId: id }]),
  );
};
