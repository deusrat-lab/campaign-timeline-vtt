// Block K — Caldran round-trip regression, run after the Block K serializer
// changes (Greyholm's arcs/routes/zones/party additions) to prove the ONE
// shared serializer (exportUserCampaignDM/reconstructUserCampaign) still
// round-trips Caldran-shaped UserCampaignData correctly -- no regression
// from anything Greyholm-side coverage touched.
//
// Uses a real, previously-exported Caldran DM export
// (scripts/stage08/fixtures/caldran-real-export.json) as the source -- the
// same fixture verify:final-migration already uses to prove migration
// engine mechanics. Exports it fresh through exportUserCampaignDM, imports
// it into a disposable target id via reconstructUserCampaign, and does the
// same normalized per-section semantic comparison the Greyholm harness does.
//
// Run with: npx tsx scripts/final-cutover/verify-caldran-round-trip-regression.ts
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { exportUserCampaignDM, reconstructUserCampaign } from '../../src/domain/portability/userCampaignPortability';
import type { UserCampaignData, UserCampaignRuntime } from '../../src/types/userCampaign';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const raw = JSON.parse(readFileSync(resolve(root, 'scripts/stage08/fixtures/caldran-real-export.json'), 'utf8')) as {
  data: UserCampaignData;
  runtime: UserCampaignRuntime;
};
const source = raw.data;

let failures: string[] = [];
function check(label: string, cond: boolean) {
  if (!cond) failures.push(label);
}

function idSet(arr: Array<{ id: string }> | undefined): Set<string> {
  return new Set((arr ?? []).map((x) => x.id));
}
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function deepSortedJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sort(obj[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

const exportedText = exportUserCampaignDM(source, undefined);
check('export produced non-empty text', exportedText.length > 1000);

const DISPOSABLE_TARGET_ID = 'camp-round-trip-caldran-disposable-test';
const reconstructed = reconstructUserCampaign(exportedText, DISPOSABLE_TARGET_ID);
check('reconstruction ok', reconstructed.ok === true);
if (!reconstructed.ok || !reconstructed.data) {
  console.error('CALDRAN_ROUND_TRIP_REGRESSION_FAIL: reconstruction failed:', 'errors' in reconstructed ? reconstructed.errors : []);
  process.exit(1);
}
const imported = reconstructed.data;

check('imported campaignId is the caller-supplied disposable target', imported.campaignId === DISPOSABLE_TARGET_ID);
check('imported campaignId differs from the source campaignId', imported.campaignId !== source.campaignId);

type Section = keyof UserCampaignData;
const sections: Section[] = ['locations', 'npcs', 'quests', 'enemies', 'factions', 'images', 'party', 'mapPlacements', 'routes', 'zones'];
for (const section of sections) {
  const srcArr = (source[section] as Array<{ id: string }> | undefined) ?? [];
  const impArr = (imported[section] as Array<{ id: string }> | undefined) ?? [];
  if (srcArr.length === 0) continue;
  check(`${section}: source count == imported count`, srcArr.length === impArr.length);
  check(`${section}: source ID set == imported ID set`, setsEqual(idSet(srcArr), idSet(impArr)));
  const normalize = (arr: Array<{ id: string }>) => deepSortedJson([...arr].sort((a, b) => a.id.localeCompare(b.id)));
  check(`${section}: normalized snapshot matches`, normalize(srcArr) === normalize(impArr));
}

// referential integrity within the imported copy
const impLocationIds = idSet(imported.locations);
const impNpcIds = idSet(imported.npcs);
let dangling = 0;
for (const npc of imported.npcs) if (npc.locationId && !impLocationIds.has(npc.locationId)) dangling++;
for (const quest of imported.quests) {
  if (quest.locationId && !impLocationIds.has(quest.locationId)) dangling++;
  for (const npcId of quest.npcIds ?? []) if (!impNpcIds.has(npcId)) dangling++;
}
for (const enemy of imported.enemies) for (const locId of enemy.locationIds ?? []) if (!impLocationIds.has(locId)) dangling++;
check('0 dangling references in the imported copy', dangling === 0);

if (failures.length) {
  console.error('CALDRAN_ROUND_TRIP_REGRESSION_FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, verdict: 'CALDRAN_ROUND_TRIP_REGRESSION_PASS', sectionsChecked: sections }, null, 2));
