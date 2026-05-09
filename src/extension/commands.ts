import type { ConfigStoreAPI } from '../config/store.js';
import type { SunobomohAPI } from './api.js';
import type { StateStoreAPI } from '../state/store.js';
import type { SteererAPI } from '../steering/types.js';

export interface CommandDefinition {
  readonly name: string;
  handler(args: string, ctx: unknown): Promise<void>;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const { buildConfigCommand } = await import('./commands.js');
 * const cmd = buildConfigCommand({} as never, {} as never, {} as never);
 * expect(cmd.name).toBe('sunobomoh:config');
 * expect(typeof cmd.handler).toBe('function');
 * ```
 */
export const buildConfigCommand = (
  _api: SunobomohAPI,
  _config: ConfigStoreAPI,
  _builtins: unknown,
): CommandDefinition => ({
  name: 'sunobomoh:config',
  handler: (): Promise<void> => Promise.resolve(),
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const { buildWatchCommand } = await import('./commands.js');
 * const cmd = buildWatchCommand({} as never);
 * expect(cmd.name).toBe('watch');
 * expect(typeof cmd.handler).toBe('function');
 * ```
 */
export const buildWatchCommand = (_store: StateStoreAPI): CommandDefinition => ({
  name: 'watch',
  handler: (): Promise<void> => Promise.resolve(),
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const { buildStateCommand } = await import('./commands.js');
 * const cmd = buildStateCommand({} as never);
 * expect(cmd.name).toBe('state');
 * expect(typeof cmd.handler).toBe('function');
 * ```
 */
export const buildStateCommand = (_store: StateStoreAPI): CommandDefinition => ({
  name: 'state',
  handler: (): Promise<void> => Promise.resolve(),
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const { buildSteerCommand } = await import('./commands.js');
 * const cmd = buildSteerCommand({} as never);
 * expect(cmd.name).toBe('steer');
 * expect(typeof cmd.handler).toBe('function');
 * ```
 */
export const buildSteerCommand = (_steerer: SteererAPI): CommandDefinition => ({
  name: 'steer',
  handler: (): Promise<void> => Promise.resolve(),
});
