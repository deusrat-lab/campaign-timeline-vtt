// Block I (this session) anti-legacy guard for the universal campaign
// registry authority cutover (src/domain/registry/registryAuthorityStore.ts):
// fails if userCampaignStore.tsx reintroduces a direct
// `writeJson(REGISTRY_KEY, ...)` write that bypasses `commitRegistryAndPersist`
// (the sole choke point that commits through `commitRegistry` before
// projecting into the legacy `REGISTRY_KEY` localStorage write).
//
// User-Campaign (Caldran) only -- Greyholm has no registry write path at all
// (it is represented read-only as a synthetic seed record injected by
// readUniversalRegistry()/lookupCampaign(), never persisted).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  if (!/function commitRegistryAndPersist/.test(text)) {
    failed.push(`${file}: commitRegistryAndPersist() choke point missing -- registry authority cutover regressed`);
  }
  if (!/commitRegistry\(registryAuthorityStorage\(\),\s*candidate\)/.test(text)) {
    failed.push(`${file}: commitRegistryAndPersist() no longer routes through commitRegistry() -- universal registry authority bypassed`);
  }

  // Every raw `writeJson(REGISTRY_KEY, ...)` outside commitRegistryAndPersist's
  // own body (its defensive fallback, used only if the universal commit
  // itself rejects the candidate) is a bypass. commitRegistryAndPersist
  // contains exactly 2 such calls (the fail-safe branch and the normal
  // projected-write branch) -- any OTHER occurrence in the file is a
  // reintroduced direct write.
  const totalCount = (text.match(/writeJson\(REGISTRY_KEY,/g) ?? []).length;
  // 1 doc-comment mention (line ~118, explaining the rule) + 2 real calls
  // inside commitRegistryAndPersist's own body (fail-safe branch + the
  // normal projected-write branch).
  const bypassCount = totalCount - 3;
  if (bypassCount > 0) {
    failed.push(`${file}: found ${bypassCount} direct writeJson(REGISTRY_KEY, ...) call(s) outside commitRegistryAndPersist -- registry writes must route through the universal commit`);
  }

  // Every legacy mutation call site must funnel through persistRegistry /
  // touchRegistry / commitRegistryAndPersist, never construct-and-writeJson
  // inline elsewhere.
  const requiredCallers = ['persistRegistry', 'touchRegistry', 'renameCampaign', 'upsertRegistryFrom'];
  for (const fn of requiredCallers) {
    if (!text.includes(fn)) {
      failed.push(`${file}: expected registry mutation function '${fn}' not found -- guard's assumptions about the choke points may be stale`);
    }
  }
}

if (failed.length) {
  console.error('LEGACY_REGISTRY_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_REGISTRY_WRITE_PATH_FOUND' }));
