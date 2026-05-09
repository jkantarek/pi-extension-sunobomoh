import type { TagId } from '../core/brands.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from './types.js';
import type { StateEntry } from '../state/types.js';
import { initializeOutcomes } from './outcomes.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { createTagRegistry } = await import('./registry.js');
 * const reg = createTagRegistry();
 * const entry: StateEntry = {
 *   type: 'state_entry',
 *   id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' as any,
 *   sourceId: 'test-watcher' as any,
 *   sourceUri: 'test:///resource' as any,
 *   label: 'Test Entry',
 *   timestamp: '2026-05-07T10:00:00Z' as any,
 *   tags: [],
 *   outcomes: new Map(),
 *   data: {},
 *   needsAttention: false,
 *   metadata: { watchedAt: '2026-05-07T10:00:00Z' as any },
 * };
 * const tagIds: readonly TagId[] = ['urgent' as any, 'needs-review' as any];
 * const result = applyTagsToEntry(entry, tagIds, reg);
 * expect(result.tags).toEqual(tagIds);
 * expect(result.outcomes.size).toBe(2);
 * expect(result.outcomes.get('urgent' as any)?.status).toBe('active');
 * expect(result.outcomes.get('needs-review' as any)?.status).toBe('pending');
 * const unknownResult = applyTagsToEntry(entry, ['unknown' as any], reg);
 * expect(unknownResult.outcomes.size).toBe(1);
 * expect(unknownResult.outcomes.get('unknown' as any)?.tagId).toBe('unknown');
 * ```
 */
export const applyTagsToEntry = (
  entry: StateEntry,
  tagIds: readonly TagId[],
  registry: Registry<TagDefinition>,
): StateEntry => ({
  ...entry,
  tags: tagIds,
  outcomes: initializeOutcomes(tagIds, registry),
});
