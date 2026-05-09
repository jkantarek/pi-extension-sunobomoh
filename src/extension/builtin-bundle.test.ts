import { describe, it, expect } from 'vitest';
import { createBuiltinWatcherBundle } from './builtin-bundle.js';

describe('createBuiltinWatcherBundle', () => {
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
    const uri = fsEntry?.definition.extractUri(undefined, {});
    expect(typeof uri).toBe('string');
    expect(uri).toContain('file://');
  });

  it('filesystem watcher definition extractLabel returns string', () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const label = fsEntry?.definition.extractLabel(undefined, {});
    expect(typeof label).toBe('string');
    expect(label).toBe('Placeholder');
  });

  it('filesystem watcher definition extractTags returns array with informational tag', () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const tags = fsEntry?.definition.extractTags(undefined, {});
    expect(Array.isArray(tags)).toBe(true);
    expect(tags?.length).toBeGreaterThan(0);
    expect(tags?.[0]).toBe('informational');
  });

  it('filesystem watcher definition watch returns empty array', async () => {
    const bundle = createBuiltinWatcherBundle();
    const fsEntry = bundle.get('filesystem');
    const events = await fsEntry?.definition.watch({}, new AbortController().signal);
    expect(Array.isArray(events)).toBe(true);
    expect(events?.length).toBe(0);
  });
});
