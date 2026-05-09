import { describe, it, expect } from 'vitest';
import { Type } from 'typebox';
import type { ResourceUri } from '../core/brands.js';
import { unsafeWatcherId, unsafeTagId, toResourceUri, isOk } from '../core/brands.js';
import { createIdFactory } from '../core/ids.js';
import { createSystemClock } from '../core/ports.js';
import { toStateEntry } from './coerce.js';
import type { WatcherDefinition } from './types.js';

describe('toStateEntry', () => {
  it('coerces event to StateEntry with correct fields', () => {
    const def: WatcherDefinition<object, string> = {
      id: unsafeWatcherId('test'),
      name: 'Test',
      description: 'Test watcher',
      configSchema: Type.Object({}),
      watch: () => Promise.resolve([]),
      extractUri: (): ResourceUri => {
        const r = toResourceUri('file:///test');
        if (isOk(r)) return r.value;
        throw new Error('Invalid URI');
      },
      extractLabel: (event) => `Label: ${event}`,
      extractTags: () => [unsafeTagId('informational')],
    };
    const ids = createIdFactory();
    const clock = createSystemClock();
    const entry = toStateEntry('test-event', def, {}, clock, ids);

    expect(entry.id.length).toBe(26);
    expect(entry.label).toBe('Label: test-event');
    expect(entry.sourceId).toBe('test');

    const uriResult = toResourceUri('file:///test');
    expect(isOk(uriResult)).toBe(true);
    if (isOk(uriResult)) {
      expect(entry.sourceUri).toBe(uriResult.value);
    }

    expect(entry.tags).toEqual([unsafeTagId('informational')]);
    expect(entry.needsAttention).toBe(false);
    expect(entry.timestamp).toBeDefined();
    expect(entry.type).toBe('state_entry');
  });
});
