import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { _setSunobomohInstance, type SunobomohAPI } from './api.js';
import { createWatcherRegistry } from '../watchers/registry.js';
import { createTagRegistry } from '../tags/registry.js';
import { createStateStore } from '../state/store.js';
import { createConfigStore } from '../config/store.js';
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from '../scheduler/scheduler.js';
import { createSteerer, DEFAULT_STEERING_CONFIG } from '../steering/steerer.js';
import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
import { createStateQuery } from '../state/query.js';
import { ok, err, type Result } from '../core/result.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SchedulerState, SchedulerAPI } from '../scheduler/types.js';
import type { WatcherDefinition } from '../watchers/types.js';
import type { TagDefinition } from '../tags/types.js';
import type { RegisteredWatcherInfo, BuiltinWatcherEntry } from '../config/types.js';
import { createBuiltinWatcherBundle } from './builtin-bundle.js';
import { buildWatchQueryTool, buildMarkAttentionTool, buildTriggerSteerTool } from './tools.js';
import {
  buildConfigCommand,
  buildWatchCommand,
  buildStateCommand,
  buildSteerCommand,
} from './commands.js';

/* eslint-disable max-lines-per-function -- DI wiring entry point */
export default function (pi: ExtensionAPI): void {
  const fs = createNodeFileSystem();
  const clock = createSystemClock();
  const stateFile = join(homedir(), '.pi', 'sunobomoh-state.jsonl');
  const configFile = join(homedir(), '.pi', 'sunobomoh.config.json');
  const store = createStateStore(stateFile, fs, clock);
  const watcherRegistry = createWatcherRegistry();
  const tagRegistry = createTagRegistry();
  const steerer = createSteerer(DEFAULT_STEERING_CONFIG, tagRegistry, store, undefined, clock);
  const configStore = createConfigStore(configFile, fs);
  const builtins = createBuiltinWatcherBundle();
  let scheduler: SchedulerAPI | undefined;

  const api: SunobomohAPI = {
    registerWatcher: (definition: unknown, config: unknown): void => {
      watcherRegistry.register({ definition: definition as WatcherDefinition, config });
    },
    registerTag: (definition: unknown): void => {
      tagRegistry.register(definition as TagDefinition);
    },
    getRegisteredWatchers: (): readonly RegisteredWatcherInfo[] => [],
    getAvailableBuiltins: (): readonly BuiltinWatcherEntry[] => Array.from(builtins.values()),
    unregisterWatcher: (): void => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    query: () => createStateQuery(store.model),
    triggerTick: async (): Promise<Result<void>> => {
      if (scheduler === undefined) return err(new Error('Scheduler not started'));
      await scheduler.triggerTick();
      return ok(undefined);
    },
    triggerSteering: async (): Promise<Result<void>> => {
      const result = await steerer.run(new AbortController().signal);
      if (result.ok) return ok(undefined);
      return result;
    },
    get schedulerState(): SchedulerState {
      return scheduler?.state ?? { running: false, tickCount: 0 };
    },
  };

  _setSunobomohInstance(api);

  pi.on('session_start', async (): Promise<void> => {
    await store.load();
    const mockRunner = (): Promise<Result<readonly never[]>> => Promise.resolve(ok([]));
    const mockSteering = (): Promise<Result<void>> => Promise.resolve(ok(undefined));
    scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, mockRunner, mockSteering, clock);
  });

  pi.on('session_shutdown', (): void => {
    scheduler?.stop();
  });

  pi.registerTool(buildWatchQueryTool(store) as never);
  pi.registerTool(buildMarkAttentionTool(store) as never);
  pi.registerTool(buildTriggerSteerTool(steerer) as never);

  const configCmd = buildConfigCommand(api, configStore, builtins);
  const watchCmd = buildWatchCommand(store);
  const stateCmd = buildStateCommand(store);
  const steerCmd = buildSteerCommand(steerer);

  pi.registerCommand(configCmd.name, configCmd);
  pi.registerCommand(watchCmd.name, watchCmd);
  pi.registerCommand(stateCmd.name, stateCmd);
  pi.registerCommand(steerCmd.name, steerCmd);
}
