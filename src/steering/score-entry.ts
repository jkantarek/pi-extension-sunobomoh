import type { StateEntry } from '../state/types.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import type { IsoTimestamp } from '../core/brands.js';
import type { SteeringConfig } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { createTagRegistry } = await import('../tags/registry.js');
 * const { unsafeEntryId, unsafeWatcherId, unsafeResourceUri, unsafeIsoTimestamp, unsafeTagId } = await import('../core/brands.js');
 * const { DEFAULT_STEERING_CONFIG } = await import('./types.js');
 *
 * const registry = createTagRegistry();
 * const now = unsafeIsoTimestamp('2026-05-09T12:00:00.000Z');
 * const oneHourAgo = unsafeIsoTimestamp('2026-05-09T11:00:00.000Z');
 * const oneDayAgo = unsafeIsoTimestamp('2026-05-08T12:00:00.000Z');
 *
 * const urgentEntry = {
 *   type: 'state_entry' as const,
 *   id: unsafeEntryId('01J3XYZ1234567890ABCDEFGHI'),
 *   sourceId: unsafeWatcherId('test-watcher'),
 *   sourceUri: unsafeResourceUri('test:///resource'),
 *   label: 'Test',
 *   timestamp: oneHourAgo,
 *   tags: [unsafeTagId('urgent')],
 *   outcomes: new Map(),
 *   data: {},
 *   needsAttention: false,
 *   metadata: { watchedAt: oneHourAgo },
 * };
 *
 * const staleEntry = {
 *   ...urgentEntry,
 *   id: unsafeEntryId('01J3XYZ1234567890ABCDEFGHJ'),
 *   tags: [unsafeTagId('stale')],
 *   timestamp: oneDayAgo,
 *   metadata: { watchedAt: oneDayAgo },
 * };
 *
 * const urgentScore = scoreEntry(urgentEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(urgentScore).toBeGreaterThan(70);
 *
 * const staleScore = scoreEntry(staleEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(staleScore).toBeLessThan(5);
 *
 * const oldUrgentEntry = { ...urgentEntry, timestamp: oneDayAgo, metadata: { watchedAt: oneDayAgo } };
 * const oldUrgentScore = scoreEntry(oldUrgentEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(oldUrgentScore).toBeLessThan(urgentScore);
 *
 * const veryHighScore = scoreEntry({ ...urgentEntry, tags: [unsafeTagId('urgent'), unsafeTagId('needs-review')] }, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(veryHighScore).toBeLessThanOrEqual(100);
 * expect(veryHighScore).toBeGreaterThanOrEqual(0);
 *
 * const unknownTagEntry = { ...urgentEntry, tags: [unsafeTagId('unknown-tag')] };
 * const unknownScore = scoreEntry(unknownTagEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(unknownScore).toBe(0);
 * ```
 */
const computeDecay = (ageMs: number, halfLifeHours: number): number =>
  Math.pow(0.5, ageMs / (1000 * 60 * 60 * halfLifeHours));

const computeTagWeight = (entry: StateEntry, registry: Registry<TagDefinition>): number =>
  entry.tags.reduce((sum, tagId) => sum + (registry.get(tagId)?.attentionWeight ?? 0) * 10, 0);

const computeAge = (entryTime: IsoTimestamp, nowTime: IsoTimestamp): number =>
  new Date(nowTime).getTime() - new Date(entryTime).getTime();

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export function scoreEntry(
  entry: StateEntry,
  registry: Registry<TagDefinition>,
  config: SteeringConfig,
  now: IsoTimestamp,
): number {
  const weight = computeTagWeight(entry, registry);
  const age = computeAge(entry.timestamp, now);
  return clamp(weight * computeDecay(age, config.recencyDecayHalfLifeHours));
}
