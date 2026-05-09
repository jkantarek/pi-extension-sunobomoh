import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import { createStateStore } from './store.js';
import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
import type { FileSystem } from '../core/ports.js';
import { makeTestEntryJson } from './test-fixtures.js';
import type { EntryId } from '../core/brands.js';

const tmpFile = (): string => join(tmpdir(), `sunobomoh-test-${randomUUID()}.jsonl`);

describe('StateStore.load()', () => {
  it('loads empty model when file does not exist', async () => {
    const store = createStateStore(tmpFile(), createNodeFileSystem(), createSystemClock());
    const result = await store.load();
    expect(result.ok).toBe(true);
    expect(store.model.entryCount).toBe(0);
  });

  it('builds ReadModel from pre-written JSONL', async () => {
    const path = tmpFile();
    const entry = makeTestEntryJson({ needsAttention: true });
    await writeFile(path, JSON.stringify(entry) + '\n', 'utf8');

    const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
    const result = await store.load();
    expect(result.ok).toBe(true);
    expect(store.model.entryCount).toBe(1);
    expect(store.model.byId.has(entry.id as EntryId)).toBe(true);
    expect(store.model.needsAttention.size).toBe(1);

    await rm(path);
  });

  it('skips unparseable JSONL lines gracefully', async () => {
    const path = tmpFile();
    const entry = makeTestEntryJson();
    const lines = ['not-valid-json', JSON.stringify(entry)].join('\n') + '\n';
    await writeFile(path, lines, 'utf8');

    const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
    const result = await store.load();
    expect(result.ok).toBe(true);
    expect(store.model.entryCount).toBe(1);

    await rm(path);
  });
});

describe('StateStore.append()', () => {
  it('written lines are readable after a fresh load()', async () => {
    const path = tmpFile();
    const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
    const entry = makeTestEntryJson({ id: '01ARZ3NDEKTSV4RRFFQ69G5FXX' });

    const appendResult = await store.append([entry]);
    expect(appendResult.ok).toBe(true);

    const store2 = createStateStore(path, createNodeFileSystem(), createSystemClock());
    await store2.load();
    expect(store2.model.entryCount).toBe(1);
    expect(store2.model.byId.has(entry.id as EntryId)).toBe(true);

    await rm(path);
  });

  it('returns ok(undefined) on success', async () => {
    const path = tmpFile();
    const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
    const result = await store.append([makeTestEntryJson()]);
    expect(result.ok).toBe(true);
    await rm(path);
  });

  it('returns err(Error) on write failure via injected failing fs', async () => {
    const failingFs: FileSystem = {
      readFile: (): Promise<string> => Promise.resolve(''),
      writeFile: (): Promise<void> => Promise.reject(new Error('disk full')),
      appendFile: (): Promise<void> => Promise.reject(new Error('disk full')),
      rename: (): Promise<void> => Promise.reject(new Error('disk full')),
      exists: (): Promise<boolean> => Promise.resolve(false),
    };
    const store = createStateStore('/irrelevant/path', failingFs, createSystemClock());
    const result = await store.append([makeTestEntryJson()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('disk full');
  });

  it('updates in-memory model after successful append', async () => {
    const path = tmpFile();
    const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
    await store.load();
    expect(store.model.entryCount).toBe(0);

    await store.append([makeTestEntryJson({ needsAttention: true })]);
    expect(store.model.entryCount).toBe(1);
    expect(store.model.needsAttention.size).toBe(1);

    await rm(path);
  });
});

describe('StateStore – JSONL line type coverage', () => {
  it('parses all StateLineJson types and skips unknown JSON types', async () => {
    const path = tmpFile();
    const entry = makeTestEntryJson({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
    const patchLine = {
      type: 'state_patch',
      id: 'p1',
      targetId: entry.id,
      timestamp: '2026-05-07T11:00:00Z',
      patch: { needsAttention: true },
    };
    const steeringLine = {
      type: 'steering_run',
      id: 's1',
      timestamp: '2026-05-07T12:00:00Z',
      completedAt: '2026-05-07T12:00:01Z',
      promoted: [],
      demoted: [],
      unchanged: [],
      llmAssisted: false,
    };
    const schedulerLine = {
      type: 'scheduler_run',
      id: 'r1',
      timestamp: '2026-05-07T13:00:00Z',
      watchersRun: [],
      entriesCreated: 0,
      errored: [],
      durationMs: 10,
    };
    const unknownLine = { type: 'unknown_type', id: 'u1' };
    const content =
      [entry, patchLine, steeringLine, schedulerLine, unknownLine]
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n';
    await writeFile(path, content, 'utf8');

    const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
    await store.load();
    expect(store.model.entryCount).toBe(1);
    expect(store.model.needsAttention.size).toBe(1);
    expect(store.model.lastSteeringRun?.id).toBe('s1');

    await rm(path);
  });
});
