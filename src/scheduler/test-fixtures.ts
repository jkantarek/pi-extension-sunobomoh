import { ok, type Result } from '../core/result.js';
import type { StateEntry } from '../state/types.js';

export interface MockRunner {
  fn: () => Promise<Result<readonly StateEntry[]>>;
  calls: number;
}

export interface MockSteerer {
  fn: () => Promise<Result<void>>;
  calls: number;
}

const makeCounter = (): { n: number } => ({ n: 0 });

// eslint-disable-next-line max-lines-per-function -- test fixture: mutable counter closure requires sequential setup
export const createMockRunner = (): MockRunner => {
  const c = makeCounter();
  return {
    fn: (): Promise<Result<readonly StateEntry[]>> =>
      Promise.resolve(ok([])).then((v) => {
        c.n++;
        return v;
      }),
    get calls(): number {
      return c.n;
    },
  };
};

// eslint-disable-next-line max-lines-per-function -- test fixture: mutable counter closure requires sequential setup
export const createMockSteerer = (): MockSteerer => {
  const c = makeCounter();
  return {
    fn: (): Promise<Result<void>> =>
      Promise.resolve(ok(undefined)).then((v) => {
        c.n++;
        return v;
      }),
    get calls(): number {
      return c.n;
    },
  };
};
