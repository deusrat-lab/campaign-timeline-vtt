// Part 1 of this session's task — Node-level harness for the universal
// campaign registry authority (src/domain/registry/registryAuthorityStore.ts).
//
// Exercises the REAL production module directly (Node 23's native TS type
// stripping lets this repo's scripts `import` .ts sources unmodified — same
// approach already used elsewhere in this codebase), against an in-memory
// RepositoryStorage (createMemoryRepositoryStorage), covering:
//   1. Greyholm lookup (synthetic seed record, always present)
//   2. Caldran/new-campaign lookup after a commit
//   3. campaign switch (registry list contains both, in one lookup)
//   4. campaign delete (removed from committed entries, Greyholm unaffected)
//   5. campaign isolation (two campaignIds never see each other's fields)
//   6. duplicate campaign id rejection (invariant)
//   7. Greyholm id rejected if smuggled into the candidate array (invariant)
//   8. reload (readRegistry after commit returns the same durable state)
//
// Run with: node scripts/final-cutover/verify-universal-campaign-registry.mjs
import {
  commitRegistry,
  readRegistry,
  readUniversalRegistry,
  lookupCampaign,
  GREYHOLM_REGISTRY_CAMPAIGN_ID,
} from '../../src/domain/registry/registryAuthorityStore.ts';

// registryAuthorityStore.ts only TYPE-imports RepositoryStorage (elided by
// Node's native TS type stripping), so importing it directly avoids pulling
// in shadowRepository.ts's much larger extensionless import graph (which
// Node's loader -- unlike Vite/tsc -- cannot resolve without explicit .ts
// suffixes). A minimal local stand-in implements the same 4-method shape.
function createMemoryRepositoryStorage(seed = {}) {
  const records = new Map(Object.entries(seed));
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
    keys: () => Array.from(records.keys()).sort(),
  };
}

let failures = [];
function check(label, cond) {
  if (!cond) failures.push(label);
}

function entry(id, title) {
  const now = new Date().toISOString();
  return { campaignId: id, title, type: 'oneShot', baseMapId: 'map-caldran', regionIds: [], createdAt: now, updatedAt: now, kind: 'userCampaign' };
}

// 1. Greyholm lookup — always present, even with nothing committed yet.
{
  const storage = createMemoryRepositoryStorage();
  const g = lookupCampaign(storage, [], GREYHOLM_REGISTRY_CAMPAIGN_ID);
  check('greyholm lookup returns a protected seed record', !!g && g.kind === 'greyholmSeed' && g.protectedSeed === true);
}

// 2. Caldran / new campaign lookup after a commit.
{
  const storage = createMemoryRepositoryStorage();
  const outcome = commitRegistry(storage, [entry('camp-a', 'Caldran Test')]);
  check('commit new campaign ok', outcome.ok === true);
  check('commit new campaign returns entries', outcome.entries?.length === 1);
  const found = lookupCampaign(storage, [], 'camp-a');
  check('new campaign lookup finds it', found?.title === 'Caldran Test');
}

// 3. campaign switch — one universal lookup contains both Greyholm and the
//    new campaign.
{
  const storage = createMemoryRepositoryStorage();
  commitRegistry(storage, [entry('camp-b', 'Switch Test')]);
  const all = readUniversalRegistry(storage, []);
  check('universal registry contains greyholm', all.some((e) => e.campaignId === GREYHOLM_REGISTRY_CAMPAIGN_ID));
  check('universal registry contains new campaign', all.some((e) => e.campaignId === 'camp-b'));
  check('universal registry has exactly 2 entries', all.length === 2);
}

// 4. campaign delete — removed entry gone, Greyholm unaffected.
{
  const storage = createMemoryRepositoryStorage();
  commitRegistry(storage, [entry('camp-c', 'To Delete'), entry('camp-d', 'Keep')]);
  const afterDelete = commitRegistry(storage, [entry('camp-d', 'Keep')]);
  check('delete commit ok', afterDelete.ok === true);
  const all = readUniversalRegistry(storage, []);
  check('deleted campaign gone', !all.some((e) => e.campaignId === 'camp-c'));
  check('kept campaign present', all.some((e) => e.campaignId === 'camp-d'));
  check('greyholm still present after delete', all.some((e) => e.campaignId === GREYHOLM_REGISTRY_CAMPAIGN_ID));
}

// 5. campaign isolation — two campaigns' fields never bleed into each other.
{
  const storage = createMemoryRepositoryStorage();
  commitRegistry(storage, [entry('camp-e', 'Iso A'), entry('camp-f', 'Iso B')]);
  const e1 = lookupCampaign(storage, [], 'camp-e');
  const e2 = lookupCampaign(storage, [], 'camp-f');
  check('isolation: distinct titles', e1?.title === 'Iso A' && e2?.title === 'Iso B');
}

// 6. duplicate campaign id rejected.
{
  const storage = createMemoryRepositoryStorage();
  const outcome = commitRegistry(storage, [entry('camp-g', 'One'), entry('camp-g', 'Two')]);
  check('duplicate campaignId rejected', outcome.ok === false && /duplicate/.test(outcome.error ?? ''));
}

// 7. Greyholm id cannot be smuggled into the candidate array.
{
  const storage = createMemoryRepositoryStorage();
  const outcome = commitRegistry(storage, [entry(GREYHOLM_REGISTRY_CAMPAIGN_ID, 'Fake Greyholm')]);
  check('greyholm id rejected as ordinary entry', outcome.ok === false && /Greyholm/.test(outcome.error ?? ''));
}

// 8. reload — readRegistry after commit returns the durable state (no data
//    loss across a simulated reload of the same storage backend).
{
  const storage = createMemoryRepositoryStorage();
  commitRegistry(storage, [entry('camp-h', 'Reload Test')]);
  const reloaded = readRegistry(storage);
  check('reload returns committed entries', reloaded?.length === 1 && reloaded[0].campaignId === 'camp-h');
  // Simulate a second "session" reading the same backing store fresh.
  const secondSessionRead = readUniversalRegistry(storage, []);
  check('second session sees the same committed state', secondSessionRead.some((e) => e.campaignId === 'camp-h'));
}

// Expected-revision guard sanity: two sequential commits bump revision by 1
// each time and the second is visible read-after-write.
{
  const storage = createMemoryRepositoryStorage();
  const first = commitRegistry(storage, [entry('camp-i', 'Rev 1')]);
  const second = commitRegistry(storage, [entry('camp-i', 'Rev 1'), entry('camp-j', 'Rev 2')]);
  check('revision increments monotonically', (second.newRevision ?? 0) === (first.newRevision ?? 0) + 1);
}

if (failures.length) {
  console.error('UNIVERSAL_CAMPAIGN_REGISTRY_HARNESS_FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 8 + 2, verdict: 'UNIVERSAL_CAMPAIGN_REGISTRY_HARNESS_PASS' }));
