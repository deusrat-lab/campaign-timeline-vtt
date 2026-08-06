// Block H — Node-level unit harness for the tab-scoped view-mode helpers.
//
// Verifies, without a browser, that:
//   1. Greyholm's `loadPersistedMode`/`savePersistedMode` (src/state/campaignStore.tsx)
//      round-trip through sessionStorage and default to 'dm-view' when unset/invalid.
//   2. Caldran's `loadUcTabMode`/`saveUcTabMode` (src/state/userCampaignStore.tsx)
//      do the same, per campaignId, and default to 'dmView'.
//   3. Two independent sessionStorage instances (simulating two browser tabs)
//      never see each other's mode — the actual property Block H exists to guarantee.
//
// The real helper functions live inside large React store modules that pull
// in Vite-only features (import.meta.env) elsewhere in their import graph,
// which a plain Node/tsx run can't resolve without a full Vite runtime. To
// test the ACTUAL shipped source (not a reimplementation) without that
// dependency, this harness extracts the exact helper block by source
// markers and executes it in a small vm sandbox with a stub `window`. If
// either source file is refactored so these markers no longer match, this
// harness fails loudly instead of silently testing stale/reimplemented logic.
//
// This is a targeted unit test of the persistence/scoping logic itself, not
// of React rendering or cross-tab browser behavior (that needs a real
// browser — see the manual 3-tab verification in CONTINUATION_STATE.json).
//
// Run with: node scripts/verify-block-h-tab-scoped-mode.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = process.cwd();

function extractBlock(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Block H harness: could not find start marker for ${label}: ${JSON.stringify(startMarker)}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Block H harness: could not find end marker for ${label}: ${JSON.stringify(endMarker)}`);
  return source.slice(start, end + endMarker.length);
}

/** Minimal sessionStorage stand-in — one instance == one "browser tab". */
function makeSessionStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

const results = [];
function check(name, ok) {
  results.push({ name, ok });
}

function main() {
  // Rebuild helpers bound to a fresh vm context each time we need a distinct
  // "tab" (fresh sessionStorage) — cheapest correct way to isolate state.
  function freshGreyholm(sessionStorage) {
    const src = readFileSync(resolve(root, 'src/state/campaignStore.tsx'), 'utf8');
    const block = extractBlock(
      src,
      "export const MODE_SESSION_KEY",
      "export function savePersistedMode(mode: AppMode): void {\n  try {\n    window.sessionStorage.setItem(MODE_SESSION_KEY, mode);\n  } catch {\n    // Best-effort only; an in-memory mode still works for this page's lifetime.\n  }\n}",
      'Greyholm mode helpers (campaignStore.tsx)',
    );
    const js = block
      .replace(/export function loadPersistedMode\(\): AppMode \{/, 'function loadPersistedMode() {')
      .replace(/export function savePersistedMode\(mode: AppMode\): void \{/, 'function savePersistedMode(mode) {')
      .replace(/export const MODE_SESSION_KEY/, 'const MODE_SESSION_KEY');
    const wrapped = `${js}\n;globalThis.__out = { MODE_SESSION_KEY, loadPersistedMode, savePersistedMode };`;
    const ctx = { window: { sessionStorage } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(wrapped, ctx);
    return ctx.__out;
  }

  function freshCaldran(sessionStorage) {
    const src = readFileSync(resolve(root, 'src/state/userCampaignStore.tsx'), 'utf8');
    const block = extractBlock(
      src,
      "export const ucModeSessionKey",
      "export function saveUcTabMode(id: string, mode: UserCampaignMode): void {\n  try {\n    window.sessionStorage.setItem(ucModeSessionKey(id), mode);\n  } catch {\n    // Best-effort only; an in-memory mode still works for this page's lifetime.\n  }\n}",
      'Caldran mode helpers (userCampaignStore.tsx)',
    );
    const js = block
      .replace(/export function loadUcTabMode\(id: string\): UserCampaignMode \{/, 'function loadUcTabMode(id) {')
      .replace(/export function saveUcTabMode\(id: string, mode: UserCampaignMode\): void \{/, 'function saveUcTabMode(id, mode) {')
      .replace(/export const ucModeSessionKey = \(id: string\) =>/, 'const ucModeSessionKey = (id) =>');
    const wrapped = `${js}\n;globalThis.__out = { ucModeSessionKey, loadUcTabMode, saveUcTabMode };`;
    const ctx = { window: { sessionStorage } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(wrapped, ctx);
    return ctx.__out;
  }

  {
    const { loadPersistedMode } = freshGreyholm(makeSessionStorage());
    check('Greyholm: defaults to dm-view when sessionStorage empty', loadPersistedMode() === 'dm-view');
  }
  {
    const { loadPersistedMode, savePersistedMode } = freshGreyholm(makeSessionStorage());
    savePersistedMode('dm-edit');
    check('Greyholm: round-trips a saved mode', loadPersistedMode() === 'dm-edit');
    savePersistedMode('player-view');
    check('Greyholm: overwrites a previously saved mode', loadPersistedMode() === 'player-view');
  }
  {
    const ss = makeSessionStorage();
    const { loadPersistedMode, MODE_SESSION_KEY } = freshGreyholm(ss);
    ss.setItem(MODE_SESSION_KEY, 'not-a-real-mode');
    check('Greyholm: rejects a corrupt/unknown stored value, falls back to dm-view', loadPersistedMode() === 'dm-view');
  }
  {
    const tabA = freshGreyholm(makeSessionStorage());
    const tabB = freshGreyholm(makeSessionStorage());
    tabA.savePersistedMode('dm-edit');
    tabB.savePersistedMode('player-view');
    check('Greyholm: two independent tabs keep independent modes', tabA.loadPersistedMode() === 'dm-edit' && tabB.loadPersistedMode() === 'player-view');
  }

  // --- Caldran (userCampaignStore) ---
  const CID = 'demo-campaign-1';
  const CID2 = 'demo-campaign-2';

  {
    const { loadUcTabMode } = freshCaldran(makeSessionStorage());
    check('Caldran: defaults to dmView when sessionStorage empty', loadUcTabMode(CID) === 'dmView');
  }
  {
    const { loadUcTabMode, saveUcTabMode } = freshCaldran(makeSessionStorage());
    saveUcTabMode(CID, 'dmEdit');
    check('Caldran: round-trips a saved mode', loadUcTabMode(CID) === 'dmEdit');
    saveUcTabMode(CID, 'playerView');
    check('Caldran: overwrites a previously saved mode', loadUcTabMode(CID) === 'playerView');
  }
  {
    const ss = makeSessionStorage();
    const { loadUcTabMode, ucModeSessionKey } = freshCaldran(ss);
    ss.setItem(ucModeSessionKey(CID), 'bogus');
    check('Caldran: rejects a corrupt/unknown stored value, falls back to dmView', loadUcTabMode(CID) === 'dmView');
  }
  {
    const { loadUcTabMode, saveUcTabMode } = freshCaldran(makeSessionStorage());
    saveUcTabMode(CID, 'dmEdit');
    check('Caldran: mode is scoped per campaignId, not global', loadUcTabMode(CID2) === 'dmView' && loadUcTabMode(CID) === 'dmEdit');
  }
  {
    const tabA = freshCaldran(makeSessionStorage());
    const tabB = freshCaldran(makeSessionStorage());
    tabA.saveUcTabMode(CID, 'dmEdit');
    tabB.saveUcTabMode(CID, 'playerView');
    check('Caldran: two independent tabs keep independent modes for the same campaign', tabA.loadUcTabMode(CID) === 'dmEdit' && tabB.loadUcTabMode(CID) === 'playerView');
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} — ${r.name}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  if (failed > 0) {
    console.error(`\nBLOCK_H_UNIT_HARNESS_FAIL: ${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nBLOCK_H_UNIT_HARNESS_PASS');
}

main();
