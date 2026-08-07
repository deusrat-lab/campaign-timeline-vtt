// Block M -- enforces the root campaign identity policy determined by this
// session's evidence-based investigation (see FINAL_DATA_PARITY_REPORT.json's
// rootCampaignIdentityPolicy for the full reasoning).
//
// Evidence: userCampaignStore.tsx's createCampaign() always mints a fresh
// uid('camp') id -- there is no code path, UI, or API that lets a caller
// specify or preserve a particular campaignId at creation time.
// userCampaignPortability.ts's reconstructUserCampaign(text, newCampaignId)
// always overwrites campaignId with the caller-supplied target on import.
// Both are structural, not accidental -- root campaign ID is an
// instance/storage-namespace identifier, minted fresh on every
// creation/import/clone, and is NOT part of the semantic content-identity
// contract. This is Case B in the task's own root-identity framework:
// stable content entity IDs (npc/quest/enemy/location/... ids) must match
// across import/reconstruction; the root campaignId itself never needs to
// and structurally cannot.
//
// This guard fails if either invariant regresses (e.g. someone adds a path
// that preserves or accepts a caller-supplied campaignId at creation, which
// would silently change the identity contract without the report being
// updated to match).
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
  if (!/createCampaign:\s*\(\{[^}]*\}\)\s*=>\s*\{\s*\n\s*const id = uid\('camp'\);/.test(text)) {
    failed.push(`${file}: createCampaign() no longer starts by minting a fresh uid('camp') id -- root campaign identity policy (Case B) may have changed, update FINAL_DATA_PARITY_REPORT.json's rootCampaignIdentityPolicy if this is intentional`);
  }
}

{
  const file = 'src/domain/portability/userCampaignPortability.ts';
  const text = read(file);
  if (!/export function reconstructUserCampaign\(text: string, newCampaignId: string\)/.test(text)) {
    failed.push(`${file}: reconstructUserCampaign(text, newCampaignId) signature not found -- guard's assumptions may be stale`);
  }
  if (!/campaignId:\s*newCampaignId/.test(text)) {
    failed.push(`${file}: reconstructUserCampaign no longer unconditionally overwrites campaignId with the caller-supplied newCampaignId -- root campaign identity policy (Case B) may have changed`);
  }
}

{
  const file = 'rebuild-reports/final-cutover/FINAL_DATA_PARITY_REPORT.json';
  const report = JSON.parse(read(file));
  if (!report.rootCampaignIdentityPolicy) {
    failed.push(`${file}: rootCampaignIdentityPolicy section missing`);
  } else if (report.rootCampaignIdentityPolicy.case !== 'B') {
    failed.push(`${file}: rootCampaignIdentityPolicy.case is ${JSON.stringify(report.rootCampaignIdentityPolicy.case)}, expected "B" per this guard's code-level evidence`);
  }
}

if (failed.length) {
  console.error('ROOT_CAMPAIGN_IDENTITY_POLICY_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, verdict: 'ROOT_CAMPAIGN_IDENTITY_POLICY_CASE_B_ENFORCED (instance/storage-namespace id, not content identity)' }));
