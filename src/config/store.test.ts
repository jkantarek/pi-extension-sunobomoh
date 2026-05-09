import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConfigStore } from './store.js';
import { createNodeFileSystem, type FileSystem } from '../core/ports.js';
import { isOk } from '../core/result.js';

describe('createConfigStore - load/save', () => {
  it('load() on non-existent file returns default config', async () => {
    const path = join(tmpdir(), `cfg-${Date.now().toString()}-${Math.random().toString()}.json`);
    const store = createConfigStore(path, createNodeFileSystem());
    const result = await store.load();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.watchers).toHaveLength(0);
  });
  it('load() returns err on malformed JSON', async () => {
    const path = join(tmpdir(), `cfg-${Date.now().toString()}-${Math.random().toString()}.json`);
    const fs = createNodeFileSystem();
    await fs.writeFile(path, 'not valid json{');
    const store = createConfigStore(path, fs);
    const result = await store.load();
    expect(isOk(result)).toBe(false);
  });
  it('save() returns err on write failure', async () => {
    const failingFs: FileSystem = {
      readFile: () => Promise.resolve('{}'),
      writeFile: () => Promise.reject(new Error('disk full')),
      appendFile: () => Promise.reject(new Error('disk full')),
      rename: () => Promise.reject(new Error('disk full')),
      exists: () => Promise.resolve(false),
    };
    const store = createConfigStore('/test', failingFs);
    const result = await store.save({ watchers: [] });
    expect(isOk(result)).toBe(false);
  });
});

describe('createConfigStore - watcher management - add and remove', () => {
  it('addWatcher persists and returns updated config', async () => {
    const path = join(tmpdir(), `cfg-${Date.now().toString()}-${Math.random().toString()}.json`);
    const store = createConfigStore(path, createNodeFileSystem());
    const result = await store.addWatcher({ id: 'test', config: { key: 'val' } });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.watchers).toHaveLength(1);
    expect(result.value.watchers[0]?.id).toBe('test');
  });
  it('duplicate addWatcher replaces', async () => {
    const path = join(tmpdir(), `cfg-${Date.now().toString()}-${Math.random().toString()}.json`);
    const store = createConfigStore(path, createNodeFileSystem());
    await store.addWatcher({ id: 'test', config: { key: 'v1' } });
    const result = await store.addWatcher({ id: 'test', config: { key: 'v2' } });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.watchers).toHaveLength(1);
    expect(result.value.watchers[0]?.config).toEqual({ key: 'v2' });
  });
  it('removeWatcher deletes', async () => {
    const path = join(tmpdir(), `cfg-${Date.now().toString()}-${Math.random().toString()}.json`);
    const store = createConfigStore(path, createNodeFileSystem());
    await store.addWatcher({ id: 'test', config: {} });
    const result = await store.removeWatcher('test');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.watchers).toHaveLength(0);
  });
  it('removeWatcher on unknown id is a no-op ok', async () => {
    const path = join(tmpdir(), `cfg-${Date.now().toString()}-${Math.random().toString()}.json`);
    const store = createConfigStore(path, createNodeFileSystem());
    const result = await store.removeWatcher('unknown');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.watchers).toHaveLength(0);
  });
});

describe('createConfigStore - watcher management - error handling', () => {
  it('addWatcher returns err when load fails', async () => {
    const failingFs: FileSystem = {
      readFile: () => Promise.resolve('not valid json{'),
      writeFile: () => Promise.resolve(),
      appendFile: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(true),
    };
    const store = createConfigStore('/test', failingFs);
    const result = await store.addWatcher({ id: 'test', config: {} });
    expect(isOk(result)).toBe(false);
  });
  it('addWatcher returns err when save fails', async () => {
    const failingFs: FileSystem = {
      readFile: () => Promise.resolve('{"watchers":[]}'),
      writeFile: () => Promise.reject(new Error('disk full')),
      appendFile: () => Promise.reject(new Error('disk full')),
      rename: () => Promise.reject(new Error('disk full')),
      exists: () => Promise.resolve(true),
    };
    const store = createConfigStore('/test', failingFs);
    const result = await store.addWatcher({ id: 'test', config: {} });
    expect(isOk(result)).toBe(false);
  });
  it('removeWatcher returns err when load fails', async () => {
    const failingFs: FileSystem = {
      readFile: () => Promise.resolve('not valid json{'),
      writeFile: () => Promise.resolve(),
      appendFile: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(true),
    };
    const store = createConfigStore('/test', failingFs);
    const result = await store.removeWatcher('test');
    expect(isOk(result)).toBe(false);
  });
  it('removeWatcher returns err when save fails', async () => {
    const failingFs: FileSystem = {
      readFile: () => Promise.resolve('{"watchers":[{"id":"test","config":{}}]}'),
      writeFile: () => Promise.reject(new Error('disk full')),
      appendFile: () => Promise.reject(new Error('disk full')),
      rename: () => Promise.reject(new Error('disk full')),
      exists: () => Promise.resolve(true),
    };
    const store = createConfigStore('/test', failingFs);
    const result = await store.removeWatcher('test');
    expect(isOk(result)).toBe(false);
  });
});
