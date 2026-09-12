/**
 * The pool never hands a run to an instance a failed run has poisoned. No
 * engine: a fake instance that behaves as the WebAssembly one does.
 *
 * Found driving gate 13 on an annual plan: EnergyPlus's `main` is not
 * re-entrant, so once a run on an instance ends in a fatal or a thrown
 * exception, every later run on it throws a raw C++ exception pointer before
 * doing any work. The pool used to recycle any instance whose `run()`
 * resolved, and a failure resolves, so one setpoint crossing took its engine
 * down for the rest of the session and every design handed to it failed with
 * "Engine crashed: <pointer>". The fake reproduces exactly that: after its
 * first unsuccessful run it fails everything, instantly.
 */

import { createEnginePool } from '../../../src/pool.js';
import { finish, ok } from './desk.mjs';

console.log('the pool retires a poisoned instance');

let made = 0;
const instances = [];
function createEngine() {
  const id = (made += 1);
  const instance = {
    id,
    poisoned: false,
    disposed: false,
    runs: 0,
    async run({ fail = false, cancel = false }) {
      if (this.disposed) throw new Error(`instance ${id} was run after it was disposed`);
      this.runs += 1;
      await Promise.resolve();
      if (this.poisoned) return { success: false, exitCode: 1, fatalError: 'Engine crashed: 287468688', ran: id, poisoned: true };
      if (cancel) return { success: false, cancelled: true, exitCode: 1, ran: id };
      if (fail) {
        this.poisoned = true;
        return { success: false, exitCode: 1, fatalError: 'Fatal: Program terminates due to above conditions.', ran: id };
      }
      return { success: true, exitCode: 0, ran: id };
    },
    dispose() {
      this.disposed = true;
    },
  };
  instances.push(instance);
  return Promise.resolve(instance);
}

/* ── one instance, run after run ───────────────────────────────────────── */
{
  const pool = createEnginePool({ createEngine, limit: 1 });
  const first = await pool.run({});
  const failed = await pool.run({ fail: true });
  const after = await Promise.all([pool.run({}), pool.run({}), pool.run({})]);
  ok('a design that fails reports its own fatal', !failed.success && !failed.poisoned);
  ok(
    'and no run after it lands on a poisoned instance',
    after.every((result) => result.success && !result.poisoned),
    after.map((result) => result.fatalError ?? 'ok').join('; '),
  );
  ok('the failed instance is disposed, not recycled', instances.find((i) => i.id === failed.ran).disposed);
  ok('its replacement is a new instance', after.every((result) => result.ran !== failed.ran && result.ran !== undefined));
  ok('the pool stays within its limit', pool.size() <= 1, `${pool.size()} instances`);
  ok('a successful instance is kept', first.ran === failed.ran);
}

/* ── many instances, failures scattered through a queue ────────────────── */
{
  made = 0;
  instances.length = 0;
  const pool = createEnginePool({ createEngine, limit: 4 });
  const inputs = Array.from({ length: 200 }, (_, at) => ({ fail: at % 17 === 5 }));
  const results = await Promise.all(inputs.map((input) => pool.run(input)));
  const genuine = results.filter((result, at) => !result.success && inputs[at].fail).length;
  const collateral = results.filter((result, at) => !result.success && !inputs[at].fail).length;
  ok(
    'at four engines, every failure is a genuine one and none is collateral',
    genuine === inputs.filter((input) => input.fail).length && collateral === 0,
    `${genuine} genuine, ${collateral} collateral`,
  );
  ok('and no instance ever ran after being disposed', true);
  ok('the pool never grows past its limit', pool.size() <= 4, `${pool.size()} instances`);
}

/* ── a cancelled run says nothing about its instance ───────────────────── */
{
  made = 0;
  instances.length = 0;
  const pool = createEnginePool({ createEngine, limit: 1 });
  const cancelled = await pool.run({ cancel: true });
  const next = await pool.run({});
  ok('a cancelled run keeps its instance', cancelled.cancelled && next.ran === cancelled.ran && next.success);
}

finish();
