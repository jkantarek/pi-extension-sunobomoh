import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unsafeWatcherId, unsafeTagId, toResourceUri, isOk } from '../../core/brands.js';
import { filesystemWatcher } from './filesystem-watcher.js';

interface FilesystemConfig {
  readonly path: string;
  readonly pattern?: string;
}

interface FilesystemEvent {
  readonly path: string;
}

describe('filesystemWatcher – watch()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fs-watcher-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns one event when tmp dir contains one .ts file', async () => {
    const testFile = join(tmpDir, 'example.ts');
    await writeFile(testFile, 'export const x = 42;', 'utf-8');

    const config: FilesystemConfig = { path: tmpDir };
    const signal = new AbortController().signal;
    const events = await filesystemWatcher.watch(config, signal);

    expect(events.length).toBe(1);
    expect(events[0]?.path).toBe(testFile);
  });

  it('returns empty array when tmp dir is empty', async () => {
    const config: FilesystemConfig = { path: tmpDir };
    const signal = new AbortController().signal;
    const events = await filesystemWatcher.watch(config, signal);

    expect(events.length).toBe(0);
  });

  it('filters files by pattern when pattern is provided', async () => {
    await writeFile(join(tmpDir, 'test.ts'), 'export const x = 1;', 'utf-8');
    await writeFile(join(tmpDir, 'test.js'), 'export const y = 2;', 'utf-8');
    await writeFile(join(tmpDir, 'readme.md'), '# README', 'utf-8');

    const config: FilesystemConfig = { path: tmpDir, pattern: '\\.ts$' };
    const signal = new AbortController().signal;
    const events = await filesystemWatcher.watch(config, signal);

    expect(events.length).toBe(1);
    expect(events[0]?.path).toContain('test.ts');
  });
});

describe('filesystemWatcher – extractLabel()', () => {
  it('returns filename from full path', () => {
    const event: FilesystemEvent = { path: '/home/user/code/example.ts' };
    const config: FilesystemConfig = { path: '/home/user/code' };
    const label = filesystemWatcher.extractLabel(event, config);

    expect(label).toBe('example.ts');
  });
});

describe('filesystemWatcher – extractUri()', () => {
  it('returns valid file:// URI from path', () => {
    const event: FilesystemEvent = { path: '/home/user/code/example.ts' };
    const config: FilesystemConfig = { path: '/home/user/code' };
    const uri = filesystemWatcher.extractUri(event, config);

    expect(uri).toBe('file:///home/user/code/example.ts');
    const result = toResourceUri(uri);
    expect(isOk(result)).toBe(true);
  });
});

describe('filesystemWatcher – extractTags()', () => {
  it('includes informational tag', () => {
    const event: FilesystemEvent = { path: '/home/user/code/example.ts' };
    const config: FilesystemConfig = { path: '/home/user/code' };
    const tags = filesystemWatcher.extractTags(event, config);

    expect(tags).toContain(unsafeTagId('informational'));
  });
});

describe('filesystemWatcher – definition metadata', () => {
  it('has correct id, name, and description', () => {
    expect(filesystemWatcher.id).toBe(unsafeWatcherId('filesystem'));
    expect(filesystemWatcher.name).toBe('Filesystem Watcher');
    expect(filesystemWatcher.description).toBeTruthy();
  });
});
