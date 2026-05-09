import type { StateEntry } from '../state/types.js';
import type { Group, GroupingStrategyName } from './types.js';

export const DEFAULT_GROUPING: GroupingStrategyName = 'none';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { groupEntries } = await import('./grouping.js');
 * const { createTagEmojiMap } = await import('./tag-emoji.js');
 * const { unsafeEntryId, unsafeWatcherId, unsafeTagId, unsafeIsoTimestamp, unsafeResourceUri } = await import('../core/brands.js');
 *
 * const now = Date.now();
 * const oneHourAgo = now - 3600_000;
 * const oneDayAgo = now - 86400_000;
 * const emojiMap = createTagEmojiMap(new Map());
 *
 * const entry1: StateEntry = {
 *   type: 'state_entry',
 *   id: unsafeEntryId('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
 *   sourceId: unsafeWatcherId('watcher-a'),
 *   sourceUri: unsafeResourceUri('github:///org/repo/issues/42'),
 *   label: 'Issue #42',
 *   timestamp: unsafeIsoTimestamp(new Date(oneHourAgo).toISOString()),
 *   tags: [unsafeTagId('urgent')],
 *   outcomes: new Map(),
 *   data: {},
 *   needsAttention: true,
 *   metadata: {
 *     watchedAt: unsafeIsoTimestamp(new Date(oneHourAgo).toISOString()),
 *   },
 * };
 *
 * const entry2: StateEntry = {
 *   ...entry1,
 *   id: unsafeEntryId('01ARZ3NDEKTSV4RRFFQ69G5FAW'),
 *   sourceId: unsafeWatcherId('watcher-b'),
 *   label: 'Issue #99',
 *   tags: [unsafeTagId('informational')],
 *   needsAttention: false,
 *   timestamp: unsafeIsoTimestamp(new Date(oneDayAgo).toISOString()),
 *   metadata: {
 *     watchedAt: unsafeIsoTimestamp(new Date(oneDayAgo).toISOString()),
 *   },
 * };
 *
 * // 'none' strategy: one group, no header
 * const noneResult = groupEntries([entry1, entry2], 'none', emojiMap, now);
 * expect(noneResult).toHaveLength(1);
 * expect(noneResult[0].header).toBeUndefined();
 * expect(noneResult[0].entries).toEqual([entry1, entry2]);
 *
 * // 'attention' strategy: two groups, attention first
 * const attentionResult = groupEntries([entry1, entry2], 'attention', emojiMap, now);
 * expect(attentionResult).toHaveLength(2);
 * expect(attentionResult[0].header).toBe('⚠️ Needs attention');
 * expect(attentionResult[0].entries).toEqual([entry1]);
 * expect(attentionResult[1].header).toBe('· Monitoring');
 * expect(attentionResult[1].entries).toEqual([entry2]);
 *
 * // 'tag' strategy: per-tag groups sorted by attention weight desc
 * const tagResult = groupEntries([entry1, entry2], 'tag', emojiMap, now);
 * expect(tagResult).toHaveLength(2);
 * expect(tagResult[0].header).toBe('⚠️ urgent');
 * expect(tagResult[0].entries).toEqual([entry1]);
 * expect(tagResult[1].header).toBe('ℹ️ informational');
 * expect(tagResult[1].entries).toEqual([entry2]);
 *
 * // 'source' strategy: per-watcher groups alphabetically
 * const sourceResult = groupEntries([entry2, entry1], 'source', emojiMap, now);
 * expect(sourceResult).toHaveLength(2);
 * expect(sourceResult[0].header).toBe('watcher-a');
 * expect(sourceResult[0].entries).toEqual([entry1]);
 * expect(sourceResult[1].header).toBe('watcher-b');
 * expect(sourceResult[1].entries).toEqual([entry2]);
 *
 * // Empty entries returns []
 * const emptyResult = groupEntries([], 'none', emojiMap, now);
 * expect(emptyResult).toEqual([]);
 *
 * // Unknown strategy falls back to 'none' behavior
 * const unknownResult = groupEntries([entry1, entry2], 'unknown-strategy', emojiMap, now);
 * expect(unknownResult).toHaveLength(1);
 * expect(unknownResult[0].header).toBeUndefined();
 * expect(unknownResult[0].entries).toEqual([entry1, entry2]);
 *
 * // Attention strategy with all entries needing attention
 * const allAttention = groupEntries([entry1], 'attention', emojiMap, now);
 * expect(allAttention).toHaveLength(1);
 * expect(allAttention[0].header).toBe('⚠️ Needs attention');
 *
 * // Attention strategy with no entries needing attention
 * const noAttention = groupEntries([entry2], 'attention', emojiMap, now);
 * expect(noAttention).toHaveLength(1);
 * expect(noAttention[0].header).toBe('· Monitoring');
 *
 * // Tag strategy with entry having no tags
 * const noTagEntry: StateEntry = { ...entry1, tags: [] };
 * const noTagResult = groupEntries([noTagEntry, entry2], 'tag', emojiMap, now);
 * expect(noTagResult).toHaveLength(1);
 * expect(noTagResult[0].entries).toEqual([entry2]);
 *
 * // Tag strategy: two entries with SAME tag — list accumulates (covers collectByTag list branch)
 * const entry3: StateEntry = { ...entry2, id: 'id-3' as never };
 * const sameTagResult = groupEntries([entry2, entry3], 'tag', emojiMap, now);
 * expect(sameTagResult).toHaveLength(1);
 * expect(sameTagResult[0].entries).toHaveLength(2);
 *
 * // Tag strategy: tag not in emojiMap falls back to 🔵 (covers ?? '🔵' branch)
 * const customEmoji = new Map([['urgent', '⚠️']]);
 * const customResult = groupEntries([entry2], 'tag', customEmoji, now);
 * expect(customResult[0]?.header).toContain('🔵');
 * ```
 */
export const groupEntries = (
  entries: readonly StateEntry[],
  strategy: string,
  emojiMap: ReadonlyMap<string, string>,
  nowMs: number,
): readonly Group[] => {
  if (entries.length === 0) return [];
  return dispatchStrategy(entries, strategy, emojiMap, nowMs);
};

// eslint-disable-next-line max-lines-per-function -- strategy dispatch requires one case per strategy
const dispatchStrategy = (
  entries: readonly StateEntry[],
  strategy: string,
  emojiMap: ReadonlyMap<string, string>,
  _nowMs: number,
): readonly Group[] => {
  if (strategy === 'none') return [{ entries }];
  if (strategy === 'attention') return groupByAttention(entries);
  if (strategy === 'tag') return groupByTag(entries, emojiMap);
  if (strategy === 'source') return groupBySource(entries);
  return [{ entries }];
};

const groupByAttention = (entries: readonly StateEntry[]): readonly Group[] => {
  const attention = entries.filter((e) => e.needsAttention);
  const monitoring = entries.filter((e) => !e.needsAttention);
  return buildAttentionGroups(attention, monitoring);
};

const buildAttentionGroups = (
  attention: readonly StateEntry[],
  monitoring: readonly StateEntry[],
): readonly Group[] => {
  const groups: Group[] = [];
  if (attention.length > 0) groups.push({ header: '⚠️ Needs attention', entries: attention });
  if (monitoring.length > 0) groups.push({ header: '· Monitoring', entries: monitoring });
  return groups;
};

const groupByTag = (
  entries: readonly StateEntry[],
  emojiMap: ReadonlyMap<string, string>,
): readonly Group[] => {
  const { byTag, order } = collectByTag(entries);
  return buildTagGroups(order, byTag, emojiMap);
};

const collectByTag = (
  entries: readonly StateEntry[],
): { byTag: Map<string, StateEntry[]>; order: string[] } => {
  const byTag = new Map<string, StateEntry[]>();
  const order: string[] = [];
  for (const entry of entries) processTagEntry(entry, byTag, order);
  return { byTag, order };
};

const processTagEntry = (
  entry: StateEntry,
  byTag: Map<string, StateEntry[]>,
  order: string[],
): void => {
  const tag = entry.tags[0];
  if (!tag) return;
  updateTagMap(tag, entry, byTag, order);
};

const updateTagMap = (
  tag: string,
  entry: StateEntry,
  byTag: Map<string, StateEntry[]>,
  order: string[],
): void => {
  const list = byTag.get(tag);
  if (!list) order.push(tag);
  byTag.set(tag, [...(list ?? []), entry]);
};

const buildTagGroups = (
  order: readonly string[],
  byTag: ReadonlyMap<string, StateEntry[]>,
  emojiMap: ReadonlyMap<string, string>,
): readonly Group[] =>
  order.map((tag) => ({
    header: `${emojiMap.get(tag) ?? '🔵'} ${tag}`,
    entries: byTag.get(tag) ?? [],
  }));

const groupBySource = (entries: readonly StateEntry[]): readonly Group[] => {
  const bySource = collectBySource(entries);
  return buildSourceGroups(bySource);
};

const collectBySource = (entries: readonly StateEntry[]): Map<string, StateEntry[]> => {
  const bySource = new Map<string, StateEntry[]>();
  for (const entry of entries) processSourceEntry(entry, bySource);
  return bySource;
};

const processSourceEntry = (entry: StateEntry, bySource: Map<string, StateEntry[]>): void => {
  const source = entry.sourceId;
  const list = bySource.get(source) ?? [];
  bySource.set(source, [...list, entry]);
};

const buildSourceGroups = (bySource: ReadonlyMap<string, StateEntry[]>): readonly Group[] => {
  const sorted = [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([source, list]) => ({ header: source, entries: list }));
};
