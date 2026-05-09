import type { ReadModel } from '../state/read-model.js';
import type { StateEntry } from '../state/types.js';
import type { SchedulerState } from '../scheduler/types.js';
import type { WidgetConfig, SchemeProfile } from './types.js';
import { groupEntries } from './grouping.js';
import { renderEntryLine } from './entry-line.js';
import { DEFAULT_SCHEME_PROFILES } from './scheme-profile.js';

// eslint-disable-next-line max-lines-per-function -- orchestration function coordinating grouping/rendering/truncation
export const renderAttentionWidget = (
  model: ReadModel,
  config: WidgetConfig,
  theme: string,
  nowMs: number,
): readonly string[] => {
  const profiles = mergeProfiles(config.schemeProfiles);
  const entries = collectAttentionEntries(model);
  if (entries.length === 0) return [];

  const groups = groupEntries(entries, config.grouping, config.tagEmoji, nowMs);
  const lines = renderGroups(groups, config, theme, nowMs, profiles);
  return applyMaxLines(lines, config.maxLines, entries.length);
};

const collectAttentionEntries = (model: ReadModel): readonly StateEntry[] =>
  Array.from(model.needsAttention)
    .map((id) => model.byId.get(id))
    .filter((e): e is StateEntry => e !== undefined);

const mergeProfiles = (
  custom: ReadonlyMap<string, Partial<SchemeProfile>>,
): ReadonlyMap<string, SchemeProfile> => {
  const merged = new Map(DEFAULT_SCHEME_PROFILES);
  for (const [scheme, override] of custom) {
    const base = merged.get(scheme);
    if (base) merged.set(scheme, { ...base, ...override });
  }
  return merged;
};

// eslint-disable-next-line max-lines-per-function -- group iteration requires header + entry rendering
const renderGroups = (
  groups: readonly { header?: string; entries: readonly unknown[] }[],
  config: WidgetConfig,
  theme: string,
  nowMs: number,
  profiles: ReadonlyMap<string, SchemeProfile>,
): readonly string[] => {
  const lines: string[] = [];
  for (const group of groups) {
    if (group.header) lines.push(group.header);
    for (const entry of group.entries) {
      const rendered = renderEntryLine(entry as never, config, theme, nowMs, profiles);
      lines.push(rendered.raw);
    }
  }
  return lines;
};

const applyMaxLines = (
  lines: readonly string[],
  maxLines: number,
  totalEntries: number,
): readonly string[] => {
  if (lines.length <= maxLines) return lines;
  const truncated = lines.slice(0, maxLines - 1);
  const remaining = totalEntries - (maxLines - 1);
  return [...truncated, `… and ${String(remaining)} more`];
};

export const renderFooterStatus = (state: SchedulerState, _nowMs: number): string => {
  const status = state.running ? 'running' : 'stopped';
  const tickInfo = state.tickCount > 0 ? ` (${String(state.tickCount)} ticks)` : '';
  return `sunobomoh: ${status}${tickInfo}`;
};
