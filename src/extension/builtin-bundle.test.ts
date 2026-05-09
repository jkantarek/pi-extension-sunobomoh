import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuiltinWatcherBundle } from './builtin-bundle.js';

/* eslint-disable max-lines-per-function -- Integration tests require multiple assertions */
describe('createBuiltinWatcherBundle', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'builtin-bundle-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns non-empty map with filesystem entry', () => {
    const bundle = createBuiltinWatcherBundle();
    expect(bundle.size).toBeGreaterThan(0);
    expect(bundle.has('filesystem')).toBe(true);
  });

  it('filesystem entry has correct properties', () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    expect(fsEntry).toBeDefined();
    expect(fsEntry?.id).toBe('filesystem');
    expect(fsEntry?.name).toBe('Filesystem Watcher');
    expect(typeof fsEntry?.definition.watch).toBe('function');
  });

  it('filesystem watcher definition extractUri returns valid URI', () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const event = { path: '/tmp/test.ts' };
    const uri = fsEntry?.definition.extractUri(event, { path: '/tmp' });
    expect(typeof uri).toBe('string');
    expect(uri).toContain('file://');
  });

  it('filesystem watcher definition extractLabel returns string', () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const event = { path: '/tmp/test.ts' };
    const label = fsEntry?.definition.extractLabel(event, { path: '/tmp' });
    expect(typeof label).toBe('string');
    expect(label).toBe('test.ts');
  });

  it('filesystem watcher definition extractTags returns array with informational tag', () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const event = { path: '/tmp/test.ts' };
    const tags = fsEntry?.definition.extractTags(event, { path: '/tmp' });
    expect(Array.isArray(tags)).toBe(true);
    expect(tags?.length).toBeGreaterThan(0);
    expect(tags?.[0]).toBe('informational');
  });

  it('filesystem watcher definition watch returns empty array', async () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const events = await fsEntry?.definition.watch({ path: tmpDir }, new AbortController().signal);
    expect(Array.isArray(events)).toBe(true);
    expect(events?.length).toBe(0);
  });
});
/* eslint-enable max-lines-per-function */
