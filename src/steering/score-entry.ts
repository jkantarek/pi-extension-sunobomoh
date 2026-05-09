import type { StateEntry } from '../state/types.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import type { IsoTimestamp, EntryId } from '../core/brands.js';
import type { SteeringConfig, AttentionScore } from './types.js';
import { isPromotable, isDemotable } from './classify.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { createTagRegistry } = await import('../tags/registry.js');
 * const { unsafeEntryId, unsafeWatcherId, unsafeResourceUri, unsafeIsoTimestamp, unsafeTagId } = await import('../core/brands.js');
 * const { DEFAULT_STEERING_CONFIG } = await import('./steerer.js');
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
 * expect(urgentScore.score).toBeGreaterThan(70);
 * expect(urgentScore.breakdown.length).toBeGreaterThan(0);
 * expect(urgentScore.recencyFactor).toBeGreaterThan(0);
 * expect(urgentScore.recencyFactor).toBeLessThanOrEqual(1);
 *
 * const staleScore = scoreEntry(staleEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(staleScore.score).toBeLessThan(5);
 *
 * const oldUrgentEntry = { ...urgentEntry, timestamp: oneDayAgo, metadata: { watchedAt: oneDayAgo } };
 * const oldUrgentScore = scoreEntry(oldUrgentEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(oldUrgentScore.score).toBeLessThan(urgentScore.score);
 *
 * const veryHighScore = scoreEntry({ ...urgentEntry, tags: [unsafeTagId('urgent'), unsafeTagId('needs-review')] }, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(veryHighScore.score).toBeLessThanOrEqual(100);
 * expect(veryHighScore.score).toBeGreaterThanOrEqual(0);
 *
 * const unknownTagEntry = { ...urgentEntry, tags: [unsafeTagId('unknown-tag')] };
 * const unknownScore = scoreEntry(unknownTagEntry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(unknownScore.score).toBe(0);
 * ```
 */
const computeDecay = (ageMs: number, halfLifeHours: number): number =>
  Math.pow(0.5, ageMs / (1000 * 60 * 60 * halfLifeHours));

const computeAge = (entryTime: IsoTimestamp, nowTime: IsoTimestamp): number =>
  new Date(nowTime).getTime() - new Date(entryTime).getTime();

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const computeBreakdown = (
  entry: StateEntry,
  registry: Registry<TagDefinition>,
): readonly { tagId: string; contribution: number }[] =>
  entry.tags.map((tagId) => ({
    tagId,
    contribution: (registry.get(tagId)?.attentionWeight ?? 0) * 10,
  }));

const sumContributions = (breakdown: readonly { contribution: number }[]): number =>
  breakdown.reduce((sum, { contribution }) => sum + contribution, 0);

const createTempScore = (score: number): AttentionScore => ({
  entryId: '' as never,
  score,
  breakdown: [],
  recencyFactor: 1,
  decision: 'borderline',
});

const determineDecision = (
  score: number,
  config: SteeringConfig,
): 'promote' | 'demote' | 'borderline' => {
  const temp = createTempScore(score);
  if (isPromotable(temp, config)) return 'promote';
  if (isDemotable(temp, config)) return 'demote';
  return 'borderline';
};

const computeScore = (
  breakdown: readonly { contribution: number }[],
  age: number,
  halfLife: number,
): { score: number; recencyFactor: number } => {
  const baseScore = sumContributions(breakdown);
  const recencyFactor = computeDecay(age, halfLife);
  const score = clamp(baseScore * recencyFactor);
  return { score, recencyFactor };
};

const createAttentionScore = (
  entryId: EntryId,
  score: number,
  breakdown: readonly { tagId: string; contribution: number }[],
  recencyFactor: number,
  decision: 'promote' | 'demote' | 'borderline',
): AttentionScore => ({ entryId, score, breakdown, recencyFactor, decision });

// eslint-disable-next-line max-lines-per-function -- Orchestration: compute + combine + classify
export function scoreEntry(
  entry: StateEntry,
  registry: Registry<TagDefinition>,
  config: SteeringConfig,
  now: IsoTimestamp,
): AttentionScore {
  const breakdown = computeBreakdown(entry, registry);
  const { score, recencyFactor } = computeScore(
    breakdown,
    computeAge(entry.timestamp, now),
    config.recencyDecayHalfLifeHours,
  );
  return createAttentionScore(
    entry.id,
    score,
    breakdown,
    recencyFactor,
    determineDecision(score, config),
  );
}
