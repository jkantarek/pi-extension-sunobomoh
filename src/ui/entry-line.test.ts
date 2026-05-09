import { describe, expect, it } from 'vitest';
import type { StateEntry } from '../state/types.js';
import {
  unsafeEntryId,
  unsafeIsoTimestamp,
  unsafeResourceUri,
  unsafeTagId,
  unsafeWatcherId,
} from '../core/brands.js';
import { renderEntryLine } from './entry-line.js';
import type { WidgetConfig } from './types.js';
import { DEFAULT_SCHEME_PROFILES } from './scheme-profile.js';
import { createTagEmojiMap } from './tag-emoji.js';

const baseConfig: WidgetConfig = {
  maxLines: 10,
  grouping: 'none',
  tagEmoji: createTagEmojiMap(new Map()),
  schemeProfiles: new Map(),
};

const now = Date.now();
const oneHourAgo = now - 3600_000;

const createEntry = (overrides: Partial<StateEntry> = {}): StateEntry => ({
  type: 'state_entry',
  id: unsafeEntryId('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
  sourceId: unsafeWatcherId('test-watcher'),
  sourceUri: unsafeResourceUri('github:///owner/repo/issues/42'),
  label: 'Test Issue #42',
  timestamp: unsafeIsoTimestamp(new Date(oneHourAgo).toISOString()),
  tags: [unsafeTagId('urgent')],
  outcomes: new Map(),
  data: {},
  needsAttention: false,
  metadata: {
    watchedAt: unsafeIsoTimestamp(new Date(oneHourAgo).toISOString()),
  },
  ...overrides,
});

describe('renderEntryLine - plain field', () => {
  it('should include label text', () => {
    const entry = createEntry();
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toContain('Test Issue #42');
  });

  it('should include source abbreviation', () => {
    const entry = createEntry();
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toMatch(/gh:/);
    expect(result.plain).toMatch(/#42/);
  });

  it('should include relative age', () => {
    const entry = createEntry();
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toMatch(/1h/);
  });

  it('should use emoji from tagEmoji map', () => {
    const entry = createEntry({ tags: [unsafeTagId('urgent')] });
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toContain('⚠️');
  });

  it('should use fallback emoji for empty tags array', () => {
    const entry = createEntry({ tags: [] });
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toContain('🔵');
  });
});

describe('renderEntryLine - raw field and metadata', () => {
  it('should include OSC 8 sequence for github scheme', () => {
    const entry = createEntry();
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.raw).toContain('\x1b]8;;');
    expect(result.raw).toContain('https://github.com');
  });

  it('should have entryId matching entry.id', () => {
    const entry = createEntry();
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.entryId).toBe(entry.id);
  });

  it('should render file:// URI without baseUrl', () => {
    const entry = createEntry({
      sourceUri: unsafeResourceUri('file:///tmp/test.ts'),
    });
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toMatch(/file:test\.ts/);
  });

  it('should handle URI without path component', () => {
    const entry = createEntry({
      sourceUri: unsafeResourceUri('github:///'),
    });
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.raw).toContain('https://github.com/');
    expect(result.plain).toMatch(/gh:/);
  });

  it('should handle malformed URI without triple slash', () => {
    const entry = createEntry({
      sourceUri: unsafeResourceUri('github:something'),
    });
    const result = renderEntryLine(entry, baseConfig, 'dark', now, DEFAULT_SCHEME_PROFILES);
    expect(result.plain).toMatch(/gh:/);
  });
});
