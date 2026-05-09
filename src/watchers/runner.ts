import type { Result } from '../core/result.js';
import { ok, err, isOk } from '../core/result.js';
import type { WatcherDefinition } from './types.js';
import type { StateEntry } from '../state/types.js';
import type { Clock } from '../core/ports.js';
import type { IdFactory } from '../core/ids.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import type {
  SideEffectDefinition,
  SideEffectContext,
  CallbackPhase,
} from '../side-effects/types.js';
import type { HydrationError } from '../hydrators/pipeline.js';
import { toStateEntry } from './coerce.js';
import { runHydrationPipeline } from '../hydrators/pipeline.js';
import { applyTagsToEntry } from '../tags/apply.js';
import { runPhase } from '../side-effects/executor.js';

export interface WatcherRunError {
  readonly watcherId: string;
  readonly message: string;
}

type WR = Result<readonly StateEntry[], WatcherRunError>;

export interface RunWatcherParams<TConfig> {
  readonly watcher: WatcherDefinition<TConfig>;
  readonly config: TConfig;
  readonly sideEffects: readonly SideEffectDefinition[];
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly tagRegistry: Registry<TagDefinition>;
  readonly signal: AbortSignal;
}

interface WatchExec<C> {
  readonly p: RunWatcherParams<C>;
  readonly fx: readonly SideEffectDefinition[];
  readonly b: SideEffectContext;
}

const toWatcherError = (watcherId: string, cause: unknown): WatcherRunError => ({
  watcherId,
  message: cause instanceof Error ? cause.message : String(cause),
});

const enrichWithTags = (
  entries: readonly StateEntry[],
  registry: Registry<TagDefinition>,
): readonly StateEntry[] => entries.map((e) => applyTagsToEntry(e, e.tags, registry));

const phaseCtx = (
  base: SideEffectContext,
  phase: CallbackPhase,
  entries: readonly StateEntry[],
): SideEffectContext => ({ ...base, phase, entries });

const makeWatchCtx = <C>(p: RunWatcherParams<C>): SideEffectContext => ({
  phase: 'before_watch',
  watcherId: p.watcher.id,
  entries: [],
  config: p.config,
  signal: p.signal,
});

const makeWatchExec = <C>(p: RunWatcherParams<C>): WatchExec<C> => {
  const fx = [...(p.watcher.sideEffects ?? []), ...p.sideEffects];
  const b = makeWatchCtx(p);
  return { p, fx, b };
};

const executeWatch = <C, E>(
  w: WatcherDefinition<C, E>,
  c: C,
  s: AbortSignal,
): Promise<Result<readonly E[], WatcherRunError>> =>
  w.watch(c, s).then(
    (v) => ok(v),
    (e: unknown) => err(toWatcherError(w.id, e)),
  );

const doWatch = async <C>(x: WatchExec<C>): Promise<WR> => {
  const ev = await executeWatch(x.p.watcher, x.p.config, x.p.signal);
  if (!isOk(ev)) return ev as WR;
  const raw = ev.value.map((e) => toStateEntry(e, x.p.watcher, x.p.config, x.p.clock, x.p.ids));
  await runPhase('after_watch', x.fx, phaseCtx(x.b, 'after_watch', raw));
  return ok(raw);
};

const finishHydration = async (
  wid: string,
  h: Result<readonly StateEntry[], HydrationError>,
  fx: readonly SideEffectDefinition[],
  b: SideEffectContext,
): Promise<WR> => {
  if (!h.ok) return err(toWatcherError(wid, new Error(h.error.message)));
  await runPhase('after_hydrate', fx, phaseCtx(b, 'after_hydrate', h.value));
  return ok(h.value);
};

const hydrateEntries = async <C>(x: WatchExec<C>, es: readonly StateEntry[]): Promise<WR> => {
  await runPhase('before_hydrate', x.fx, phaseCtx(x.b, 'before_hydrate', es));
  const h = await runHydrationPipeline(x.p.watcher.hydrators ?? [], es, x.p.signal);
  return finishHydration(x.p.watcher.id, h, x.fx, x.b);
};

export const runWatcher = async <C>(p: RunWatcherParams<C>): Promise<WR> => {
  const x = makeWatchExec(p);
  const bw = await runPhase('before_watch', x.fx, x.b);
  if (isOk(bw) && bw.value.halted) return ok([]);
  const rawR = await doWatch(x);
  if (!isOk(rawR)) return rawR;
  const hydrR = await hydrateEntries(x, rawR.value);
  return isOk(hydrR) ? ok(enrichWithTags(hydrR.value, x.p.tagRegistry)) : hydrR;
};
