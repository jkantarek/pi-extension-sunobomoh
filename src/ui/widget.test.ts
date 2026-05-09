import { describe, it, expect } from 'vitest';
import { renderAttentionWidget, renderFooterStatus } from './widget.js';
import { emptyModel } from '../state/read-model.js';
import type { ReadModel } from '../state/read-model.js';
import type { StateEntry } from '../state/types.js';
import type { SchedulerState } from '../scheduler/types.js';
import type { WidgetConfig } from './types.js';
import {
  unsafeEntryId,
  unsafeWatcherId,
  unsafeTagId,
  unsafeIsoTimestamp,
  unsafeResourceUri,
} from '../core/brands.js';
import { createTagEmojiMap } from './tag-emoji.js';
import { DEFAULT_SCHEME_PROFILES } from './scheme-profile.js';

describe('renderAttentionWidget', () => {
  const config: WidgetConfig = {
    maxLines: 5,
    grouping: 'none',
    tagEmoji: createTagEmojiMap(new Map()),
    schemeProfiles: DEFAULT_SCHEME_PROFILES,
  };
  const theme = 'default';
  const nowMs = Date.now();

  it('returns empty array when model has no entries', () => {
    const lines = renderAttentionWidget(emptyModel(), config, theme, nowMs);
    expect(lines).toEqual([]);
  });

  it('returns lines with correct count up to maxLines', () => {
    const entries = createTestEntries(10, nowMs);
    const model = createModelWithEntries(entries);

    const lines = renderAttentionWidget(model, config, theme, nowMs);
    expect(lines.length).toBeLessThanOrEqual(config.maxLines);
  });

  it('produces truncation line when entries exceed maxLines', () => {
    const entries = createTestEntries(10, nowMs);
    const model = createModelWithEntries(entries);

    const lines = renderAttentionWidget(model, { ...config, maxLines: 3 }, theme, nowMs);
    expect(lines.length).toBe(3);
    expect(lines[lines.length - 1]).toMatch(/more/i);
  });

  it('handles custom and unknown scheme profiles', () => {
    const customSchemes = new Map([
      ['github', { abbr: 'GH' }],
      ['unknown-scheme', { abbr: 'UK' }],
    ]);
    const customConfig = { ...config, schemeProfiles: customSchemes };
    const entries = createTestEntries(1, nowMs);
    const model = createModelWithEntries(entries);

    const lines = renderAttentionWidget(model, customConfig, theme, nowMs);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders groups with headers when using attention grouping', () => {
    const entries = createTestEntries(2, nowMs);
    const model = createModelWithEntries(entries);
    const attentionConfig = { ...config, grouping: 'attention' as const };

    const lines = renderAttentionWidget(model, attentionConfig, theme, nowMs);
    expect(lines.length).toBeGreaterThan(entries.length);
  });
});

const createTestEntries = (count: number, nowMs: number): StateEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    type: 'state_entry' as const,
    id: unsafeEntryId(`01ARZ3NDEKTSV4RRFFQ69G5FA${String(i)}`),
    sourceId: unsafeWatcherId('test-watcher'),
    sourceUri: unsafeResourceUri('test:///item'),
    label: `Item ${String(i)}`,
    timestamp: unsafeIsoTimestamp(new Date(nowMs - 1000).toISOString()),
    tags: [unsafeTagId('informational')],
    outcomes: new Map(),
    data: {},
    needsAttention: true,
    metadata: {
      watchedAt: unsafeIsoTimestamp(new Date(nowMs - 1000).toISOString()),
    },
  }));

const createModelWithEntries = (entries: StateEntry[]): ReadModel => ({
  ...emptyModel(),
  byId: new Map(entries.map((e) => [e.id, e])),
  needsAttention: new Set(entries.map((e) => e.id)),
  entryCount: entries.length,
});

describe('renderFooterStatus', () => {
  it('contains "sunobomoh" in status line', () => {
    const state: SchedulerState = {
      running: false,
      tickCount: 0,
    };
    const status = renderFooterStatus(state, Date.now());
    expect(status).toMatch(/sunobomoh/i);
  });

  it('contains "stopped" when scheduler is not running', () => {
    const state: SchedulerState = {
      running: false,
      tickCount: 0,
    };
    const status = renderFooterStatus(state, Date.now());
    expect(status).toMatch(/stopped/i);
  });

  it('contains "running" when scheduler is running', () => {
    const state: SchedulerState = {
      running: true,
      tickCount: 5,
    };
    const status = renderFooterStatus(state, Date.now());
    expect(status).toMatch(/running/i);
  });

  it('includes tick count when greater than zero', () => {
    const state: SchedulerState = {
      running: false,
      tickCount: 10,
    };
    const status = renderFooterStatus(state, Date.now());
    expect(status).toMatch(/10/);
    expect(status).toMatch(/tick/i);
  });

  it('omits tick info when count is zero', () => {
    const state: SchedulerState = {
      running: true,
      tickCount: 0,
    };
    const status = renderFooterStatus(state, Date.now());
    expect(status).not.toMatch(/tick/i);
  });
});
