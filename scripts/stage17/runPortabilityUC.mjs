// Stage 17 — User Campaign universal import/export round-trip + negative safety.
import {
  exportUserCampaignDM, exportUserCampaignPlayerSafe,
  previewUserCampaignImport, reconstructUserCampaign, userCampaignExportHash,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));

function board(mapId, tokens) {
  return { mapId, variant: 'day', round: 1, columns: 10, snap: true, showGrid: true, currentTurnTokenId: tokens[0].id, tokens };
}
function tok(id, name, side, x, y) { return { id, name, side, x, y, currentHp: 10, maxHp: 10, ac: 13, initiative: x }; }

function caldranLikeData() {
  return {
    campaignId: 'camp-portability-src', title: 'Portability Caldran', type: 'oneShot',
    baseMapId: 'map-1', mapIds: ['map-1'], regionIds: ['region-1'],
    locations: [{ id: 'loc-1', title: 'Town' }], npcs: [{ id: 'npc-1', name: 'Guard' }],
    quests: [{ id: 'q-1', title: 'Quest' }], enemies: [{ id: 'enm-goblin', title: 'Goblin', hp: 7, ac: 12 }],
    factions: [], images: [{ id: 'img-1', title: 'Map', src: 'data:,', playerSafe: true }], routes: [],
    zones: [], notes: [], party: [{ id: 'pl-1', name: 'Hero' }],
    mapPlacements: [{ id: 'plc-1', mapId: 'map-1', entityType: 'npc', entityId: 'npc-1', x: 10, y: 20, visibleToPlayers: true }],
    customBattleMaps: [
      { id: 'alpha', title: 'Alpha', dayImage: 'data:,', columns: 10 },
      { id: 'beta', title: 'Beta', dayImage: 'data:,', columns: 10 },
      { id: 'gamma', title: 'Gamma', dayImage: 'data:,', columns: 10 },
      { id: 'delta', title: 'Delta', dayImage: 'data:,', columns: 10 },
    ],
  };
}
function caldranLikeRuntime() {
  return {
    campaignId: 'camp-portability-src', activeMapId: 'map-1', mode: 'dm', notes: [], revealedToPlayers: [],
    questStatuses: {}, battleTracker: null,
    battleBoards: {
      'custom-alpha': board('custom-alpha', [tok('t1', 'Goblin', 'enemy', 15, 79), tok('t2', 'Hero', 'player', 30, 30), tok('t3', 'Wolf', 'enemy', 40, 40), tok('t4', 'Cleric', 'player', 50, 50)]),
      'custom-beta': board('custom-beta', [tok('t5', 'A', 'enemy', 5, 5), tok('t6', 'B', 'player', 6, 6), tok('t7', 'C', 'enemy', 7, 7), tok('t8', 'D', 'player', 8, 8)]),
      'custom-gamma': board('custom-gamma', [tok('t9', 'E', 'enemy', 9, 9), tok('t10', 'F', 'player', 1, 1), tok('t11', 'G', 'enemy', 2, 2), tok('t12', 'H', 'player', 3, 3)]),
      'custom-delta': board('custom-delta', [tok('t13', 'I', 'enemy', 4, 4), tok('t14', 'J', 'player', 5, 6), tok('t15', 'K', 'enemy', 6, 7), tok('t16', 'L', 'player', 7, 8)]),
    },
  };
}

export function runPortabilityUC(c = new Checks()) {
  const data = caldranLikeData();
  const runtime = caldranLikeRuntime();

  // --- deterministic DM export ---
  const dm1 = exportUserCampaignDM(data, runtime);
  const dm2 = exportUserCampaignDM(clone(data), clone(runtime));
  c.ok('uc export: DM export deterministic', dm1 === dm2);
  c.ok('uc export: DM hash stable', userCampaignExportHash(dm1) === userCampaignExportHash(dm2));
  const dmObj = JSON.parse(dm1);
  c.eq('uc export: 4 boards recorded', dmObj.boardCount, 4);
  c.eq('uc export: 16 tokens recorded', dmObj.tokenCount, 16);
  c.ok('uc export: carries universal snapshot', !!dmObj.snapshot);
  c.ok('uc export: carries legacy compat payload', !!dmObj.extensions['legacy:userCampaign']);

  // --- player-safe export: no DM snapshot, no legacy blob ---
  const ps = JSON.parse(exportUserCampaignPlayerSafe(data, runtime));
  c.eq('uc export: player-safe kind', ps.kind, 'player-safe');
  c.ok('uc export: player-safe has no DM snapshot', ps.snapshot === undefined);
  c.ok('uc export: player-safe has no legacy blob', ps.extensions === undefined);
  c.ok('uc export: player-safe has projection', ps.playerSafe !== undefined);

  // --- preview (dry-run) ---
  const preview = previewUserCampaignImport(dm1);
  c.ok('uc import: DM preview ok', preview.ok && preview.format === 'universal-user-campaign');
  c.eq('uc import: preview boards', preview.boardCount, 4);
  c.eq('uc import: preview tokens', preview.tokenCount, 16);
  c.ok('uc import: player-safe rejected as import', !previewUserCampaignImport(exportUserCampaignPlayerSafe(data, runtime)).ok);

  // --- reconstruct as NEW isolated campaign ---
  const rec = reconstructUserCampaign(dm1, 'camp-portability-dst');
  c.ok('uc import: reconstruct ok', rec.ok);
  c.eq('uc import: new campaignId assigned', rec.data.campaignId, 'camp-portability-dst');
  c.eq('uc import: runtime campaignId rewritten', rec.runtime.campaignId, 'camp-portability-dst');
  const dstBoards = rec.runtime.battleBoards;
  c.eq('uc import: 4 boards reconstructed', Object.keys(dstBoards).length, 4);
  const dstTokens = Object.values(dstBoards).reduce((s, b) => s + b.tokens.length, 0);
  c.eq('uc import: 16 tokens reconstructed', dstTokens, 16);
  const movedToken = dstBoards['custom-alpha'].tokens.find((t) => t.id === 't1');
  c.ok('uc import: moved token coords preserved (15,79)', movedToken.x === 15 && movedToken.y === 79);
  c.ok('uc import: same tokenId across campaigns (campaign-scoped identity)', movedToken.id === 't1');

  // --- source unchanged after reconstruct (immutability) ---
  c.eq('uc import: source data campaignId unchanged', data.campaignId, 'camp-portability-src');
  c.ok('uc import: source token unchanged', runtime.battleBoards['custom-alpha'].tokens[0].x === 15);

  // --- negative flows ---
  c.ok('uc negative: malformed JSON rejected', !previewUserCampaignImport('{not json').ok);
  c.ok('uc negative: unknown format rejected', !previewUserCampaignImport('{"foo":1}').ok);
  const dupRuntime = clone(runtime);
  dupRuntime.battleBoards['custom-alpha'].tokens.push(clone(dupRuntime.battleBoards['custom-alpha'].tokens[0]));
  const dupExport = exportUserCampaignDM(data, dupRuntime);
  c.ok('uc negative: duplicate token id rejected', !previewUserCampaignImport(dupExport).ok);
  const dupData = clone(data);
  dupData.npcs.push({ id: 'npc-1', name: 'Dup' });
  c.ok('uc negative: duplicate entity id rejected', !previewUserCampaignImport(exportUserCampaignDM(dupData, runtime)).ok);

  // --- backup/restore guard logic (store wires window.localStorage; here the
  // domain guarantees the store relies on) ---
  {
    const backup = exportUserCampaignDM(data, runtime); // "backup" of src campaign
    // restore into the SAME id reconstructs identical content
    const same = reconstructUserCampaign(backup, data.campaignId);
    c.ok('backup: restore into same id ok', same.ok && same.data.campaignId === data.campaignId);
    const rtBoards = Object.keys(same.runtime.battleBoards).length;
    c.eq('backup: restore preserves 4 boards', rtBoards, 4);
    // wrong-campaign guard: the backup carries the source campaignId, so a store
    // restoring it to a different id can detect the mismatch via preview.campaignId
    const pv = previewUserCampaignImport(backup);
    c.eq('backup: preview exposes source campaignId for wrong-campaign guard', pv.campaignId, data.campaignId);
    c.ok('backup: corrupt backup rejected by preview', !previewUserCampaignImport('{"format":"campaign-timeline-vtt/universal-export","kind":"portable"}').ok);
  }

  return c;
}
