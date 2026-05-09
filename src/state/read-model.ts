import type { EntryId, WatcherId, TagId } from '../core/brands.js';
import type { StateEntry, StateLineJson, SteeringRunJson, StatePatchJson } from './types.js';
import { isStateEntryJson, isStatePatchJson, isSteeringRunJson } from './types.js';
import { parseStateEntry } from './parse.js';

export interface ReadModel {
  readonly byId: ReadonlyMap<EntryId, StateEntry>;
  readonly byTag: ReadonlyMap<TagId, readonly EntryId[]>;
  readonly bySourceId: ReadonlyMap<WatcherId, readonly EntryId[]>;
  readonly needsAttention: ReadonlySet<EntryId>;
  readonly lastSteeringRun?: SteeringRunJson;
  readonly entryCount: number;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const m = emptyModel();
 * expect(m.entryCount).toBe(0);
 * expect(m.byId.size).toBe(0);
 * expect(m.byTag.size).toBe(0);
 * expect(m.bySourceId.size).toBe(0);
 * expect(m.needsAttention.size).toBe(0);
 * expect(m.lastSteeringRun).toBeUndefined();
 * ```
 */
export const emptyModel = (): ReadModel => ({
  byId: new Map(),
  byTag: new Map(),
  bySourceId: new Map(),
  needsAttention: new Set(),
  entryCount: 0,
});

const addToByTag = (
  byTag: ReadonlyMap<TagId, readonly EntryId[]>,
  entry: StateEntry,
): Map<TagId, readonly EntryId[]> => {
  const next = new Map(byTag);
  for (const tagId of entry.tags) {
    next.set(tagId, [...(next.get(tagId) ?? []), entry.id]);
  }
  return next;
};

const addToBySourceId = (
  bySourceId: ReadonlyMap<WatcherId, readonly EntryId[]>,
  entry: StateEntry,
): Map<WatcherId, readonly EntryId[]> =>
  new Map(bySourceId).set(entry.sourceId, [...(bySourceId.get(entry.sourceId) ?? []), entry.id]);

const updateNa = (na: ReadonlySet<EntryId>, id: EntryId, include: boolean): Set<EntryId> => {
  const next = new Set(na);
  if (include) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
};

const projectStateEntry = (model: ReadModel, entry: StateEntry): ReadModel => ({
  byId: new Map(model.byId).set(entry.id, entry),
  byTag: addToByTag(model.byTag, entry),
  bySourceId: addToBySourceId(model.bySourceId, entry),
  needsAttention: updateNa(model.needsAttention, entry.id, entry.needsAttention),
  ...(model.lastSteeringRun !== undefined && { lastSteeringRun: model.lastSteeringRun }),
  entryCount: model.entryCount + 1,
});

const applyPatch = (existing: StateEntry, patch: StatePatchJson['patch']): StateEntry => ({
  ...existing,
  needsAttention: patch.needsAttention ?? existing.needsAttention,
  ...(patch.attentionScore !== undefined && { attentionScore: patch.attentionScore }),
  ...(patch.tags !== undefined && { tags: patch.tags.map((t): TagId => t as TagId) }),
});

const projectStatePatch = (model: ReadModel, line: StatePatchJson): ReadModel => {
  const targetId = line.targetId as EntryId;
  const existing = model.byId.get(targetId);
  if (existing === undefined) return model;
  const updated = applyPatch(existing, line.patch);
  const byId = new Map(model.byId).set(targetId, updated);
  const na = updateNa(model.needsAttention, targetId, updated.needsAttention);
  return { ...model, byId, needsAttention: na };
};

/**
 * @example
 * ```ts @import.meta.vitest
 * const steeringLine = {
 *   type: 'steering_run' as const, id: '01ARZ', timestamp: '2026-05-07T11:00:00Z',
 *   completedAt: '2026-05-07T11:00:01Z', promoted: [], demoted: [], unchanged: [],
 *   llmAssisted: false,
 * };
 * const m = projectLine(emptyModel(), steeringLine);
 * expect(m.lastSteeringRun?.id).toBe('01ARZ');
 *
 * const schedulerLine = {
 *   type: 'scheduler_run' as const, id: '01BRZ', timestamp: '2026-05-07T10:00:00Z',
 *   watchersRun: [], entriesCreated: 0, errored: [], durationMs: 10,
 * };
 * const m2 = projectLine(emptyModel(), schedulerLine);
 * expect(m2.lastSteeringRun).toBeUndefined();
 * ```
 */
export const projectLine = (model: ReadModel, line: StateLineJson): ReadModel => {
  if (isStateEntryJson(line)) return projectStateEntry(model, parseStateEntry(line));
  if (isStatePatchJson(line)) return projectStatePatch(model, line);
  if (isSteeringRunJson(line)) return { ...model, lastSteeringRun: line };
  return model;
};

export { parseStateEntry, isStateEntryJson };
