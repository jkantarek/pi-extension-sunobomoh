import type { FileSystem } from '../core/ports.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { SunobomohConfig, WatcherConfigEntry } from './types.js';

export interface ConfigStoreAPI {
  load(): Promise<Result<SunobomohConfig>>;
  save(config: SunobomohConfig): Promise<Result<void>>;
  addWatcher(entry: WatcherConfigEntry): Promise<Result<SunobomohConfig>>;
  removeWatcher(id: string): Promise<Result<SunobomohConfig>>;
}

const DEFAULT_CONFIG: SunobomohConfig = { watchers: [] };

/**
 * @example
 * ```ts @import.meta.vitest
 * const { tmpdir } = await import('node:os');
 * const { join } = await import('node:path');
 * const { createNodeFileSystem } = await import('../core/ports.js');
 * const { isOk } = await import('../core/result.js');
 * const path = join(tmpdir(), `cfg-test-${Date.now().toString()}.json`);
 * const store = createConfigStore(path, createNodeFileSystem());
 * const loaded = await store.load();
 * expect(isOk(loaded)).toBe(true);
 * if (isOk(loaded)) expect(loaded.value.watchers).toHaveLength(0);
 *
 * const added = await store.addWatcher({ id: 'github', config: { owner: 'x' } });
 * expect(isOk(added)).toBe(true);
 * if (isOk(added)) expect(added.value.watchers).toHaveLength(1);
 *
 * const removed = await store.removeWatcher('github');
 * expect(isOk(removed)).toBe(true);
 * if (isOk(removed)) expect(removed.value.watchers).toHaveLength(0);
 * ```
 */
/* eslint-disable max-lines-per-function -- Factory closure pattern */
export const createConfigStore = (filePath: string, fs: FileSystem): ConfigStoreAPI => ({
  async load(): Promise<Result<SunobomohConfig>> {
    if (!(await fs.exists(filePath))) return ok(DEFAULT_CONFIG);
    const content = await fs.readFile(filePath);
    try {
      return ok(JSON.parse(content));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  },
  async save(config: SunobomohConfig): Promise<Result<void>> {
    try {
      const tmpPath = `${filePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(config, null, 2));
      await fs.rename(tmpPath, filePath);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  },
  async addWatcher(entry: WatcherConfigEntry): Promise<Result<SunobomohConfig>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const existing = loaded.value.watchers.filter((w) => w.id !== entry.id);
    const updated = { ...loaded.value, watchers: [...existing, entry] };
    const saved = await this.save(updated);
    return saved.ok ? ok(updated) : saved;
  },
  async removeWatcher(id: string): Promise<Result<SunobomohConfig>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const updated = { ...loaded.value, watchers: loaded.value.watchers.filter((w) => w.id !== id) };
    const saved = await this.save(updated);
    return saved.ok ? ok(updated) : saved;
  },
});
