// Stage 13 harness helpers. Pure Node; deterministic (manual scheduler, no
// wall-clock sleeps as the primary sync mechanism). Reuses the Stage 9
// instrumented storage + manual scheduler patterns.
import { setImmediate as setImmediatePromise } from 'node:timers/promises';

export function instrumentedStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const ops = { get: 0, set: 0, remove: 0 };
  const touchedKeys = new Set();
  return {
    storage: {
      getItem: (key) => { ops.get += 1; touchedKeys.add(key); return map.get(key) ?? null; },
      setItem: (key, value) => { ops.set += 1; touchedKeys.add(key); map.set(key, value); },
      removeItem: (key) => { ops.remove += 1; touchedKeys.add(key); map.delete(key); },
    },
    ops,
    touchedKeys,
    rawKeys: () => Array.from(map.keys()),
    raw: map,
    writeCount: () => ops.set + ops.remove,
  };
}

/** A storage whose setItem always throws — proves diagnostics_persistence_failed
 * never escapes into the legacy path. */
export function failingStorage() {
  return {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {},
  };
}

/** Deterministic scheduler: queued fns only fire when the harness flushes. */
export function manualScheduler() {
  let pending = [];
  let id = 0;
  return {
    scheduler: {
      set: (fn) => { const handle = ++id; pending.push({ handle, fn }); return handle; },
      clear: (handle) => { pending = pending.filter((p) => p.handle !== handle); },
    },
    pendingCount: () => pending.length,
    flush: () => { const runnable = pending; pending = []; for (const p of runnable) p.fn(); },
  };
}

/** Drive the coordinator to a quiescent state deterministically. */
export async function settle(coordinator, sched, maxRounds = 200) {
  for (let i = 0; i < maxRounds; i += 1) {
    while (sched.pendingCount() > 0) sched.flush();
    await setImmediatePromise();
    const busy = coordinator.getAllStatuses().some((s) => s.running || s.pending > 0);
    if (!busy && sched.pendingCount() === 0) return;
  }
  throw new Error('settle: coordinator did not become quiescent');
}
