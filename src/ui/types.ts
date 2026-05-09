import type { StateEntry } from '../state/types.js';

export interface WidgetConfig {
  readonly maxLines: number;
  readonly grouping: GroupingStrategyName;
  readonly tagEmoji: ReadonlyMap<string, string>;
  readonly schemeProfiles: ReadonlyMap<string, Partial<SchemeProfile>>;
}

export interface SchemeProfile {
  readonly abbr: string;
  readonly baseUrl?: string;
  readonly shortId: (uri: string) => string;
}

export type AgeColorName = 'fresh' | 'recent' | 'stale';

export interface RenderedEntryLine {
  readonly entryId: string;
  readonly plain: string;
  readonly raw: string;
}

export type GroupingStrategyName = 'none' | 'source' | 'tag' | 'date' | 'attention';

export interface Group {
  readonly header?: string;
  readonly entries: readonly StateEntry[];
}

export type GroupingStrategy = (entries: readonly StateEntry[], nowMs: number) => readonly Group[];
