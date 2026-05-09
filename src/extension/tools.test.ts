/* eslint-disable max-lines -- test file */
import { describe, it, expect } from 'vitest';
import { buildWatchQueryTool, buildMarkAttentionTool, buildTriggerSteerTool } from './tools.js';
import type { StateStoreAPI } from '../state/store.js';
import type { SteererAPI } from '../steering/types.js';
import { ok } from '../core/result.js';
import { emptyModel } from '../state/read-model.js';
import { unsafeEntryId } from '../core/brands.js';

describe('buildWatchQueryTool', () => {
  it('returns a valid tool definition with correct name, parameters schema, and execute', () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    expect(tool.name).toBe('watch_query');
    expect(typeof tool.parameters).toBe('object');
    expect(typeof tool.execute).toBe('function');
  });

  it('execute returns content', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    const result = await tool.execute({});
    expect(typeof result.content).toBe('string');
  });
});

describe('buildMarkAttentionTool', () => {
  it('returns a valid tool definition with correct name, parameters schema, and execute', () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildMarkAttentionTool(store);
    expect(tool.name).toBe('watch_mark_attention');
    expect(typeof tool.parameters).toBe('object');
    expect(typeof tool.execute).toBe('function');
  });
});

describe('buildTriggerSteerTool', () => {
  it('returns a valid tool definition with correct name, parameters schema, and execute', () => {
    const steerer: SteererAPI = {
      run: () =>
        Promise.resolve(ok({ promoted: [], demoted: [], borderline: [], llmOverrides: [] })),
    };
    const tool = buildTriggerSteerTool(steerer);
    expect(tool.name).toBe('watch_trigger_steer');
    expect(typeof tool.parameters).toBe('object');
    expect(typeof tool.execute).toBe('function');
  });
});

describe('buildMarkAttentionTool execute', () => {
  it('returns success content when marking entries', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildMarkAttentionTool(store);
    const result = await tool.execute({ entryIds: ['id1', 'id2'], needsAttention: true });
    expect(result.content).toContain('Marked 2 entries');
  });

  it('returns failure content when store.append fails', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve({ ok: false, error: new Error('fail') }),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildMarkAttentionTool(store);
    const result = await tool.execute({ entryIds: ['id1'], needsAttention: false });
    expect(result.content).toBe('Failed to mark entries');
  });
});

describe('buildTriggerSteerTool execute', () => {
  it('returns success content with promoted and demoted counts', async () => {
    const steerer: SteererAPI = {
      run: async () =>
        Promise.resolve(
          ok({
            promoted: [unsafeEntryId('id1'), unsafeEntryId('id2')],
            demoted: [unsafeEntryId('id3')],
            borderline: [],
            llmOverrides: [],
          }),
        ),
    };
    const tool = buildTriggerSteerTool(steerer);
    const result = await tool.execute({});
    expect(result.content).toContain('Promoted: 2');
    expect(result.content).toContain('Demoted: 1');
  });

  it('returns failure content when steerer fails', async () => {
    const steerer: SteererAPI = {
      run: async () => Promise.resolve({ ok: false, error: new Error('fail') }),
    };
    const tool = buildTriggerSteerTool(steerer);
    const result = await tool.execute({});
    expect(result.content).toBe('Failed to run steering');
  });
});

describe('buildWatchQueryTool execute with filters', () => {
  it('execute with tagId filter', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    const result = await tool.execute({ tagId: 'informational' });
    expect(result.content).toContain('Found');
  });

  it('execute with watcherId filter', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    const result = await tool.execute({ watcherId: 'filesystem' });
    expect(result.content).toContain('Found');
  });

  it('execute with needsAttention filter', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    const result = await tool.execute({ needsAttention: true });
    expect(result.content).toContain('Found');
  });

  it('execute with since filter', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    const result = await tool.execute({ since: '2025-01-01T00:00:00Z' });
    expect(result.content).toContain('Found');
  });

  it('execute with until filter', async () => {
    const store: StateStoreAPI = {
      append: () => Promise.resolve(ok(undefined)),
      load: () => Promise.resolve(ok(undefined)),
      model: emptyModel(),
    };
    const tool = buildWatchQueryTool(store);
    const result = await tool.execute({ until: '2025-12-31T23:59:59Z' });
    expect(result.content).toContain('Found');
  });
});
