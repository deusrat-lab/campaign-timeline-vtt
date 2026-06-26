import type { CampaignData } from '../../data/loadCampaignData';
import type { BattleEntry } from '../../types';

/**
 * Stage 5C, Step 7 — resolves a BattleEntry's raw linked-id arrays into
 * display labels, using the real loaded `CampaignData` shape (see
 * `src/data/loadCampaignData.ts`). Field names verified against the actual
 * types rather than assumed:
 *   - DmCustomEnemy (data.enemies) uses `.name`
 *   - DmQuest (data.quests) uses `.title`
 *   - DmNpc (data.npcs) uses `.name`
 *   - LocationState (data.locationStates) uses `.title`
 *
 * Never throws on missing/empty arrays — every function returns
 * `missing: true` with the raw id as the label when a lookup fails, so a
 * stale/renamed/removed linked id never breaks the panel.
 */
export interface ResolvedLinkedEntity {
  id: string;
  label: string;
  missing: boolean;
}

function resolveIds(
  ids: string[] | undefined,
  lookup: (id: string) => string | undefined,
): ResolvedLinkedEntity[] {
  if (!ids || ids.length === 0) return [];
  return ids.map((id) => {
    const label = lookup(id);
    return label ? { id, label, missing: false } : { id, label: id, missing: true };
  });
}

export function resolveBattleEntryLinkedEnemies(
  entry: BattleEntry,
  data: CampaignData,
): ResolvedLinkedEntity[] {
  return resolveIds(entry.linkedEnemyIds, (id) => data.enemies.find((e) => e.id === id)?.name);
}

export function resolveBattleEntryLinkedQuests(
  entry: BattleEntry,
  data: CampaignData,
): ResolvedLinkedEntity[] {
  return resolveIds(entry.linkedQuestIds, (id) => data.quests.find((q) => q.id === id)?.title);
}

export function resolveBattleEntryLinkedNpcs(
  entry: BattleEntry,
  data: CampaignData,
): ResolvedLinkedEntity[] {
  return resolveIds(entry.linkedNpcIds, (id) => data.npcs.find((n) => n.id === id)?.name);
}

export function resolveBattleEntrySourceLocation(
  entry: BattleEntry,
  data: CampaignData,
): ResolvedLinkedEntity | undefined {
  if (!entry.sourceLocationStateId) return undefined;
  const id = entry.sourceLocationStateId;
  const label = data.locationStates.find((ls) => ls.id === id)?.title;
  return label ? { id, label, missing: false } : { id, label: id, missing: true };
}
