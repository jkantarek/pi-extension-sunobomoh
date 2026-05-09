import { describe, it, expect } from 'vitest';
import { githubWatcher } from './github-watcher.js';
import { unsafeTagId } from '../../core/brands.js';

/* eslint-disable max-lines-per-function -- Integration tests require multiple assertions */
describe('githubWatcher', () => {
  /* eslint-disable @typescript-eslint/require-await -- Fake fetch must match async signature */
  const fakeFetch = async (): Promise<Response> => {
    const issues = [
      { number: 42, title: 'Fix bug', labels: [{ name: 'high' }] },
      { number: 99, title: 'Critical issue', labels: [{ name: 'critical' }] },
    ];
    return new Response(JSON.stringify(issues), { status: 200 });
  };
  /* eslint-enable @typescript-eslint/require-await */

  it('should have correct id and metadata', () => {
    expect(githubWatcher.id).toBe('github');
    expect(githubWatcher.name).toBe('GitHub Watcher');
    expect(githubWatcher.description).toBeTruthy();
  });

  it('should have valid configSchema', () => {
    expect(githubWatcher.configSchema).toBeDefined();
  });

  it('should watch and return fixture issues via injected fetch', async () => {
    const cfg = { owner: 'test', repo: 'repo', fetch: fakeFetch };
    const ctrl = new AbortController();
    const events = await githubWatcher.watch(cfg, ctrl.signal);
    expect(events).toHaveLength(2);
    expect(events[0]?.number).toBe(42);
    expect(events[1]?.number).toBe(99);
  });

  it('extractLabel returns #N: title format', () => {
    const evt = { number: 42, title: 'Fix bug', labels: [] };
    const lbl = githubWatcher.extractLabel(evt, { owner: 'a', repo: 'b' });
    expect(lbl).toBe('#42: Fix bug');
  });

  it('extractUri returns github:/// URI', () => {
    const evt = { number: 42, title: 'Fix', labels: [] };
    const uri = githubWatcher.extractUri(evt, { owner: 'foo', repo: 'bar' });
    expect(uri).toContain('github:///');
    expect(uri).toContain('foo');
    expect(uri).toContain('bar');
    expect(uri).toContain('42');
  });

  it('extractTags maps high/critical priority to urgent', () => {
    const high = { number: 1, title: 'H', labels: [{ name: 'high' }] };
    const crit = { number: 2, title: 'C', labels: [{ name: 'critical' }] };
    const cfg = { owner: 'a', repo: 'b' };
    expect(githubWatcher.extractTags(high, cfg)).toContain(unsafeTagId('urgent'));
    expect(githubWatcher.extractTags(crit, cfg)).toContain(unsafeTagId('urgent'));
  });

  it('extractTags defaults to needs-review for other labels', () => {
    const evt = { number: 1, title: 'T', labels: [{ name: 'bug' }] };
    const cfg = { owner: 'a', repo: 'b' };
    const tags = githubWatcher.extractTags(evt, cfg);
    expect(tags).toContain(unsafeTagId('needs-review'));
  });

  it('extractTags returns informational when no labels', () => {
    const evt = { number: 1, title: 'T', labels: [] };
    const cfg = { owner: 'a', repo: 'b' };
    const tags = githubWatcher.extractTags(evt, cfg);
    expect(tags).toEqual([unsafeTagId('informational')]);
  });
  it('watch returns empty array when fetch responds with non-ok status', async () => {
    const fakeFetch = async (): Promise<{ ok: boolean; json: () => Promise<unknown> }> =>
      Promise.resolve({ ok: false, json: async () => Promise.resolve([]) });
    const cfg = { owner: 'a', repo: 'b', fetch: fakeFetch as never };
    const result = await githubWatcher.watch(cfg, new AbortController().signal);
    expect(result).toHaveLength(0);
  });

  it('uses globalThis.fetch when cfg.fetch is omitted (covers ?? branch)', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    // fetch is omitted — the ?? globalThis.fetch branch fires
    // The aborted signal causes the request to fail, but the branch is covered
    await expect(githubWatcher.watch({ owner: 'a', repo: 'b' }, ctrl.signal)).rejects.toBeDefined();
  });
});
/* eslint-enable max-lines-per-function */
