import { readFile as fsReadFile, appendFile as fsAppendFile, access } from 'node:fs/promises';
import type { IsoTimestamp } from './brands.js';
import { toIsoTimestamp } from './brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { tmpdir } = await import('node:os');
 * const { join } = await import('node:path');
 * const fs = createNodeFileSystem();
 * const path = join(tmpdir(), `test-ports-${Date.now()}.txt`);
 * await fs.appendFile(path, 'hello');
 * expect(await fs.exists(path)).toBe(true);
 * expect(await fs.readFile(path)).toBe('hello');
 * expect(await fs.exists('/non/existent/__sunobomoh_test__')).toBe(false);
 * ```
 */
export interface FileSystem {
  readFile(path: string): Promise<string>;
  appendFile(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface Clock {
  now(): IsoTimestamp;
}

export const createNodeFileSystem = (): FileSystem => ({
  readFile: (path: string) => fsReadFile(path, 'utf8'),
  appendFile: (path: string, data: string) => fsAppendFile(path, data, 'utf8'),
  exists: (path: string): Promise<boolean> =>
    access(path).then(
      () => true,
      () => false,
    ),
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const clock = createSystemClock();
 * expect(typeof clock.now()).toBe('string');
 * expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
 * ```
 */
export const createSystemClock = (): Clock => ({
  now: (): IsoTimestamp => toIsoTimestamp(new Date()),
});
