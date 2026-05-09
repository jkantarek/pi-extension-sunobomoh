import type { EntryId, WatcherId, TagId, IsoTimestamp, ResourceUri } from '../core/brands.js';
import type {
  StateEntryJson,
  TagOutcomeJson,
  StateEntryMetadataJson,
  StateEntry,
  TagOutcome,
  StateEntryMetadata,
} from './types.js';

const parseTagOutcome = (v: TagOutcomeJson): TagOutcome => ({
  tagId: v.tagId as TagId,
  status: v.status,
  ...(v.outcome !== undefined && { outcome: v.outcome }),
  ...(v.resolvedAt !== undefined && { resolvedAt: v.resolvedAt as IsoTimestamp }),
  ...(v.notes !== undefined && { notes: v.notes }),
});

const parseMetadata = (m: StateEntryMetadataJson): StateEntryMetadata => ({
  watchedAt: m.watchedAt as IsoTimestamp,
  ...(m.hydratedAt !== undefined && { hydratedAt: m.hydratedAt as IsoTimestamp }),
  ...(m.lastSteeringAt !== undefined && { lastSteeringAt: m.lastSteeringAt as IsoTimestamp }),
  ...(m.steeringDecision !== undefined && { steeringDecision: m.steeringDecision }),
});

const buildOutcomes = (json: StateEntryJson): ReadonlyMap<TagId, TagOutcome> => {
  const map = new Map<TagId, TagOutcome>();
  for (const [k, v] of Object.entries(json.outcomes)) {
    map.set(k as TagId, parseTagOutcome(v));
  }
  return map;
};

const parseBrandedFields = (
  json: StateEntryJson,
): Pick<StateEntry, 'id' | 'sourceId' | 'sourceUri' | 'timestamp' | 'tags'> => ({
  id: json.id as EntryId,
  sourceId: json.sourceId as WatcherId,
  sourceUri: json.sourceUri as ResourceUri,
  timestamp: json.timestamp as IsoTimestamp,
  tags: json.tags.map((t): TagId => t as TagId),
});

const buildOptionals = (
  json: StateEntryJson,
): Pick<StateEntry, 'hydratedData' | 'attentionScore'> => ({
  ...(json.hydratedData !== undefined && { hydratedData: json.hydratedData }),
  ...(json.attentionScore !== undefined && { attentionScore: json.attentionScore }),
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const { isStateEntryJson } = await import('./types.js');
 * const { parseStateEntry } = await import('./parse.js');
 * const result = parseStateEntry({
 *   type: 'state_entry', id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', sourceId: 'watcher-1',
 *   sourceUri: 'file:///path', label: 'Test', timestamp: '2026-05-07T10:00:00.000Z',
 *   tags: ['urgent'],
 *   outcomes: { urgent: { tagId: 'urgent', status: 'pending' } },
 *   data: {}, needsAttention: false, metadata: { watchedAt: '2026-05-07T10:00:00.000Z' },
 * });
 * expect(typeof result.id).toBe('string');
 * expect(result.outcomes instanceof Map).toBe(true);
 * expect(result.outcomes.size).toBe(1);
 * ```
 */
export const parseStateEntry = (json: StateEntryJson): StateEntry => ({
  type: 'state_entry',
  ...parseBrandedFields(json),
  label: json.label,
  outcomes: buildOutcomes(json),
  data: json.data,
  ...buildOptionals(json),
  needsAttention: json.needsAttention,
  metadata: parseMetadata(json.metadata),
});
