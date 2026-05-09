import type { WatcherId, IsoTimestamp } from '../core/brands.js';
import type { SchedulerConfig } from '../scheduler/types.js';
import type { SteeringConfig } from '../steering/types.js';
import type { WatcherDefinition } from '../watchers/types.js';

export interface SunobomohConfig {
  readonly stateFile?: string;
  readonly scheduler?: Partial<SchedulerConfig>;
  readonly steering?: Partial<SteeringConfig>;
  readonly watchers: readonly WatcherConfigEntry[];
  readonly widget?: WidgetUserConfig;
}

export interface WidgetUserConfig {
  readonly maxLines?: number;
  readonly grouping?: GroupingStrategyName;
  readonly tagEmoji?: Readonly<Record<string, string>>;
  readonly schemeProfiles?: Readonly<Record<string, { abbr?: string; baseUrl?: string }>>;
}

export type GroupingStrategyName = 'none' | 'source' | 'tag' | 'date' | 'attention';

export interface WatcherConfigEntry {
  readonly id: string;
  readonly config: Record<string, unknown>;
}

export interface RegisteredWatcherInfo {
  readonly id: WatcherId;
  readonly name: string;
  readonly description: string;
  readonly source: 'config' | 'programmatic';
  readonly managedBy?: string;
  readonly lastRunAt?: IsoTimestamp;
  readonly lastRunError?: string;
  readonly entryCount: number;
}

export interface BuiltinWatcherEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly definition: WatcherDefinition;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const valid = { maxLines: 8, grouping: 'none' };
 * expect(isWidgetUserConfig(valid)).toBe(true);
 *
 * const missingField = { maxLines: 'not-a-number' };
 * expect(isWidgetUserConfig(missingField)).toBe(false);
 *
 * const empty = {};
 * expect(isWidgetUserConfig(empty)).toBe(true);
 *
 * expect(isWidgetUserConfig(null)).toBe(false);
 * expect(isWidgetUserConfig('string')).toBe(false);
 *
 * const invalidGrouping = { grouping: 'invalid' };
 * expect(isWidgetUserConfig(invalidGrouping)).toBe(false);
 *
 * const validGrouping = { grouping: 'source' };
 * expect(isWidgetUserConfig(validGrouping)).toBe(true);
 *
 * const invalidEmoji = { tagEmoji: 'not-an-object' };
 * expect(isWidgetUserConfig(invalidEmoji)).toBe(false);
 *
 * const validEmoji = { tagEmoji: { urgent: '🚨' } };
 * expect(isWidgetUserConfig(validEmoji)).toBe(true);
 *
 * const invalidProfiles = { schemeProfiles: [] };
 * expect(isWidgetUserConfig(invalidProfiles)).toBe(false);
 *
 * const validProfiles = { schemeProfiles: { github: { abbr: 'gh' } } };
 * expect(isWidgetUserConfig(validProfiles)).toBe(true);
 * ```
 */
/* eslint-disable complexity -- Type guard needs multiple checks */
export function isWidgetUserConfig(value: unknown): value is WidgetUserConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj['maxLines'] !== undefined && typeof obj['maxLines'] !== 'number') return false;
  if (obj['grouping'] !== undefined && !isValidGroupingStrategy(obj['grouping'])) return false;
  if (obj['tagEmoji'] !== undefined && !isRecord(obj['tagEmoji'])) return false;
  if (obj['schemeProfiles'] !== undefined && !isRecord(obj['schemeProfiles'])) return false;
  return true;
}

function isValidGroupingStrategy(value: unknown): value is GroupingStrategyName {
  return (
    value === 'none' ||
    value === 'source' ||
    value === 'tag' ||
    value === 'date' ||
    value === 'attention'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
