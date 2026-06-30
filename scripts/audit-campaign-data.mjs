import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public/data/dm-companion');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/№/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function nameParts(location) {
  return [location.name, ...(location.aliases ?? [])]
    .flatMap((name) => String(name).split(/[\/|]/g))
    .map(normalize)
    .filter((part) => part.length >= 5);
}

function samePlace(a, b) {
  const aParts = nameParts(a);
  const bParts = nameParts(b);
  return aParts.some((aPart) =>
    bParts.some((bPart) => aPart === bPart || (aPart.length >= 10 && bPart.includes(aPart)) || (bPart.length >= 10 && aPart.includes(bPart))),
  );
}

function arrayOf(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function reportBroken(label, rows) {
  if (rows.length === 0) {
    console.log(`OK ${label}`);
    return 0;
  }
  console.error(`BROKEN ${label}: ${rows.length}`);
  for (const row of rows.slice(0, 30)) console.error(`  - ${row}`);
  if (rows.length > 30) console.error(`  ... ${rows.length - 30} more`);
  return rows.length;
}

const locations = readJson('locations.json');
const npcs = readJson('npcs.json');
const quests = readJson('quests.json');
const enemies = readJson('custom-enemies.json');
const images = readJson('images.json');
const taverns = readJson('taverns.json');
const shops = readJson('shops.json');
const factions = readJson('factions.json');

const locationIds = new Set(locations.map((item) => item.id));
const npcIds = new Set(npcs.map((item) => item.id));
const questIds = new Set(quests.map((item) => item.id));
const enemyIds = new Set(enemies.map((item) => item.id));
const imageIds = new Set(images.map((item) => item.id));
const factionIds = new Set(factions.map((item) => item.id));

let failures = 0;
failures += reportBroken('npc.location', npcs.filter((npc) => npc.location && !locationIds.has(npc.location)).map((npc) => `${npc.id} -> ${npc.location}`));
failures += reportBroken('quest.location', quests.filter((quest) => quest.location && !locationIds.has(quest.location)).map((quest) => `${quest.id} -> ${quest.location}`));
failures += reportBroken('quest.giver', quests.filter((quest) => quest.giver && !npcIds.has(quest.giver)).map((quest) => `${quest.id} -> ${quest.giver}`));
failures += reportBroken('quest.enemies', quests.flatMap((quest) => arrayOf(quest.enemies).filter((id) => !enemyIds.has(id)).map((id) => `${quest.id} -> ${id}`)));
failures += reportBroken('enemy.locationIds', enemies.flatMap((enemy) => arrayOf(enemy.locationIds).filter((id) => !locationIds.has(id)).map((id) => `${enemy.id} -> ${id}`)));
failures += reportBroken('enemy.questIds', enemies.flatMap((enemy) => arrayOf(enemy.questIds).filter((id) => !questIds.has(id)).map((id) => `${enemy.id} -> ${id}`)));
failures += reportBroken('location.npcs', locations.flatMap((location) => arrayOf(location.npcs).filter((id) => !npcIds.has(id)).map((id) => `${location.id} -> ${id}`)));
failures += reportBroken('location.quests', locations.flatMap((location) => arrayOf(location.quests).filter((id) => !questIds.has(id)).map((id) => `${location.id} -> ${id}`)));
failures += reportBroken('location.images', locations.flatMap((location) => arrayOf(location.images).filter((id) => !imageIds.has(id)).map((id) => `${location.id} -> ${id}`)));
failures += reportBroken('image linked ids', images.flatMap((image) => [
  ...arrayOf(image.linkedLocationIds).filter((id) => !locationIds.has(id)).map((id) => `${image.id} linkedLocationIds -> ${id}`),
  ...arrayOf(image.linkedQuestIds).filter((id) => !questIds.has(id)).map((id) => `${image.id} linkedQuestIds -> ${id}`),
  ...arrayOf(image.linkedEnemyIds).filter((id) => !enemyIds.has(id)).map((id) => `${image.id} linkedEnemyIds -> ${id}`),
]));
failures += reportBroken('tavern/shop locations', [
  ...taverns.filter((item) => item.location && !locationIds.has(item.location)).map((item) => `${item.id} -> ${item.location}`),
  ...shops.filter((item) => item.location && !locationIds.has(item.location)).map((item) => `${item.id} -> ${item.location}`),
]);
failures += reportBroken('faction ids', [...npcs, ...quests, ...enemies, ...locations].flatMap((item) =>
  [item.primaryFactionId, ...arrayOf(item.factionIds)].filter((id) => id && !factionIds.has(id)).map((id) => `${item.id} -> ${id}`),
));

const arc2Locations = locations.filter((location) => location.arcId === 'arc-2');
const sharedArc2 = arc2Locations
  .map((arc2) => ({
    arc2,
    base: locations.find((candidate) => (candidate.arcId ?? 'arc-1') === 'arc-1' && samePlace(candidate, arc2)),
  }))
  .filter((pair) => pair.base);

console.log(`Arc summary: locations=${locations.length}, npcs=${npcs.length}, quests=${quests.length}, enemies=${enemies.length}, images=${images.length}`);
console.log(`Arc 2 shared-location candidates: ${sharedArc2.length}/${arc2Locations.length}`);
for (const pair of sharedArc2.slice(0, 20)) {
  console.log(`  ${pair.base.name} (${pair.base.id}) <-> ${pair.arc2.name} (${pair.arc2.id})`);
}

if (failures > 0) {
  console.error(`Campaign data audit failed: ${failures} broken references.`);
  process.exit(1);
}

console.log('Campaign data audit passed.');
