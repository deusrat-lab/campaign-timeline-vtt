// Stage 9 harness helpers. Pure Node; deterministic (manual scheduler, no
// wall-clock sleeps as the primary sync mechanism).
import { setImmediate as setImmediatePromise } from 'node:timers/promises';

/** Storage that records every read/write/remove so the harness can prove
 * "flag off -> zero storage activity" and "shadow-only namespace" invariants. */
export function instrumentedStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const ops = { get: 0, set: 0, remove: 0, keys: 0 };
  const touchedKeys = new Set();
  return {
    storage: {
      getItem: (key) => { ops.get += 1; touchedKeys.add(key); return map.get(key) ?? null; },
      setItem: (key, value) => { ops.set += 1; touchedKeys.add(key); map.set(key, value); },
      removeItem: (key) => { ops.remove += 1; touchedKeys.add(key); map.delete(key); },
      keys: () => { ops.keys += 1; return Array.from(map.keys()).sort(); },
    },
    ops,
    touchedKeys,
    rawKeys: () => Array.from(map.keys()),
    raw: map,
    writeCount: () => ops.set + ops.remove,
  };
}

/** Deterministic scheduler: timers only fire when the harness flushes them. */
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
export async function settle(coordinator, sched, maxRounds = 100) {
  for (let i = 0; i < maxRounds; i += 1) {
    while (sched.pendingCount() > 0) sched.flush();
    await setImmediatePromise();
    const busy = coordinator.getAllStatuses().some((s) => s.running || s.pending);
    if (!busy && sched.pendingCount() === 0) return;
  }
  throw new Error('settle: coordinator did not become quiescent');
}
