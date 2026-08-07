// Block K — new-campaign round trip. A short automated proof (not a full
// Block J browser lifecycle repeat): construct a minimal, representative
// UserCampaignData by hand (content + a relation + a map placement + a
// route), export it through the SAME shared serializer, import into an
// isolated disposable target, and do the same normalized comparison.
//
// Run with: npx tsx scripts/final-cutover/verify-new-campaign-round-trip.ts
import { exportUserCampaignDM, reconstructUserCampaign } from '../../src/domain/portability/userCampaignPortability';
import type { UserCampaignData } from '../../src/types/userCampaign';

let failures: string[] = [];
function check(label: string, cond: boolean) {
  if (!cond) failures.push(label);
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

const source: UserCampaignData = {
  campaignId: 'camp-new-campaign-disposable-source',
  title: 'New Campaign Round-Trip Check',
  type: 'oneShot',
  baseMapId: 'atlas-map-caldran',
  mapIds: ['atlas-map-caldran'],
  regionIds: ['region-caldran'],
  locations: [{ id: 'loc-1', title: 'Test Location', description: 'A disposable test location.' }],
  npcs: [{ id: 'npc-1', name: 'Test NPC', locationId: 'loc-1' }],
  quests: [{ id: 'quest-1', title: 'Test Quest', status: 'active', locationId: 'loc-1', npcIds: ['npc-1'] }],
  enemies: [{ id: 'enemy-1', title: 'Test Enemy', locationIds: ['loc-1'] }],
  images: [],
  routes: [{ id: 'route-1', title: 'Test Route', mapId: 'atlas-map-caldran', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], type: 'road', visibleToPlayers: true }],
  zones: [{ id: 'zone-1', title: 'Test Zone', mapId: 'atlas-map-caldran', points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }], visibleToPlayers: false }],
  notes: [],
  party: [{ id: 'pc-1', name: 'Test Character', playerName: 'Test Player' }],
  factions: [{ id: 'faction-1', name: 'Test Faction' }],
  mapPlacements: [{ id: 'plc-1', mapId: 'atlas-map-caldran', entityType: 'npc', entityId: 'npc-1', x: 42, y: 58, visibleToPlayers: true }],
  capabilities: { economy: false },
  arcs: [{ id: 'arc-1', arcId: 'arc-1', title: 'Arc 1', order: 0, isDefault: true }],
};

const exportedText = exportUserCampaignDM(source, undefined);
check('export produced non-empty text', exportedText.length > 500);

const DISPOSABLE_TARGET_ID = 'camp-new-campaign-disposable-target';
const reconstructed = reconstructUserCampaign(exportedText, DISPOSABLE_TARGET_ID);
check('reconstruction ok', reconstructed.ok === true);
if (!reconstructed.ok || !reconstructed.data) {
  console.error('NEW_CAMPAIGN_ROUND_TRIP_FAIL: reconstruction failed:', 'errors' in reconstructed ? reconstructed.errors : []);
  process.exit(1);
}
const imported = reconstructed.data;

check('imported campaignId is the caller-supplied disposable target', imported.campaignId === DISPOSABLE_TARGET_ID);
check('imported campaignId differs from the source campaignId', imported.campaignId !== source.campaignId);

type Section = keyof UserCampaignData;
const sections: Section[] = ['locations', 'npcs', 'quests', 'enemies', 'factions', 'party', 'mapPlacements', 'routes', 'zones', 'arcs'];
for (const section of sections) {
  const srcArr = (source[section] as Array<{ id: string }> | undefined) ?? [];
  const impArr = (imported[section] as Array<{ id: string }> | undefined) ?? [];
  check(`${section}: source count == imported count`, srcArr.length === impArr.length);
  const normalize = (arr: Array<{ id: string }>) => deepSortedJson([...arr].sort((a, b) => a.id.localeCompare(b.id)));
  check(`${section}: normalized snapshot matches`, normalize(srcArr) === normalize(impArr));
}

// relation preserved: quest.npcIds -> npc-1 still resolves
check('quest.npcIds relation preserved and resolves', (imported.quests[0]?.npcIds ?? []).includes('npc-1') && imported.npcs.some((n) => n.id === 'npc-1'));
check('capabilities preserved', imported.capabilities?.economy === false);

if (failures.length) {
  console.error('NEW_CAMPAIGN_ROUND_TRIP_FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, verdict: 'NEW_CAMPAIGN_ROUND_TRIP_PASS' }, null, 2));
