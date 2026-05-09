import type { Result } from '../core/result.js';
import type { FileSystem, Clock } from '../core/ports.js';
import { ok, err } from '../core/result.js';
import { toError } from '../core/errors.js';
import type { StateLineJson } from './types.js';
import {
  isStateEntryJson,
  isStatePatchJson,
  isSteeringRunJson,
  isSchedulerRunJson,
} from './types.js';
import { emptyModel, projectLine } from './read-model.js';
import type { ReadModel } from './read-model.js';

export interface StateStoreAPI {
  append(lines: readonly StateLineJson[]): Promise<Result<void>>;
  load(): Promise<Result<void>>;
  readonly model: Readonly<ReadModel>;
}

interface StateStoreState {
  model: ReadModel;
}

const isValidLine = (v: unknown): v is StateLineJson =>
  isStateEntryJson(v) || isStatePatchJson(v) || isSteeringRunJson(v) || isSchedulerRunJson(v);

const parseLine = (raw: string): StateLineJson | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidLine(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const buildModel = (raw: string): ReadModel =>
  raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map(parseLine)
    .filter((l): l is StateLineJson => l !== undefined)
    .reduce(projectLine, emptyModel());

const loadModel = (filePath: string, fs: FileSystem): Promise<ReadModel> =>
  fs
    .exists(filePath)
    .then((exists) => (exists ? fs.readFile(filePath).then(buildModel) : emptyModel()));

const toResult = async (fn: () => Promise<void>): Promise<Result<void>> => {
  try {
    await fn();
    return ok(undefined);
  } catch (e) {
    return err(toError(e));
  }
};

const makeLoad =
  (filePath: string, fs: FileSystem, state: StateStoreState): (() => Promise<Result<void>>) =>
  (): Promise<Result<void>> =>
    toResult(async () => {
      state.model = await loadModel(filePath, fs);
    });

const makeAppend =
  (
    filePath: string,
    fs: FileSystem,
    state: StateStoreState,
  ): ((lines: readonly StateLineJson[]) => Promise<Result<void>>) =>
  (lines: readonly StateLineJson[]): Promise<Result<void>> =>
    toResult(async () => {
      await fs.appendFile(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      state.model = lines.reduce(projectLine, state.model);
    });

const buildStore = (filePath: string, fs: FileSystem, state: StateStoreState): StateStoreAPI => ({
  get model(): Readonly<ReadModel> {
    return state.model;
  },
  load: makeLoad(filePath, fs, state),
  append: makeAppend(filePath, fs, state),
});

export const createStateStore = (filePath: string, fs: FileSystem, _clock: Clock): StateStoreAPI =>
  buildStore(filePath, fs, { model: emptyModel() });
