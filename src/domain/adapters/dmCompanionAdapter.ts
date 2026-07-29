import type {
  DmCustomEnemy,
  DmEconomyEntry,
  DmEconomyReferenceItem,
  DmFaction,
  DmImageItem,
  DmLocation,
  DmNpc,
  DmPlayer,
  DmQuest,
  DmShop,
  DmTavern,
} from '../../types/dmCompanion';
import { defaultCapabilities } from '../campaign/capabilities';
import { makeRevision, makeSchemaVersion } from '../campaign/ids';
import { createCampaignSnapshot } from '../campaign/snapshot';
import type { CampaignDurableData } from '../campaign/snapshot';
import type { SourceMetadata } from '../campaign/source';
import type { UniversalEntity } from '../entities/types';
import { HIDDEN_VISIBILITY, PUBLIC_VISIBILITY } from '../visibility/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { adapterError, adapterWarning, classification } from './types';
import type { AdapterResult } from './types';
import { campaignIdFromLegacy, entityIdFromLegacy } from './idMapping';

export interface DmCompanionAdapterInput {
  targetCampaignId: string;
  locations?: DmLocation[];
  npcs?: DmNpc[];
  quests?: DmQuest[];
  enemies?: DmCustomEnemy[];
  images?: DmImageItem[];
  factions?: DmFaction[];
  players?: DmPlayer[];
  shops?: DmShop[];
  taverns?: DmTavern[];
  economy?: DmEconomyEntry[];
  economyReference?: DmEconomyReferenceItem[];
  source?: Partial<SourceMetadata>;
}

export function adaptDmCompanionToUniversal(input: DmCompanionAdapterInput): AdapterResult {
  const source: SourceMetadata = { kind: 'dm-companion', sourceId: input.targetCampaignId, ...input.source };
  const campaignId = campaignIdFromLegacy('greyholm', input.targetCampaignId);
  const now = '1970-01-01T00:00:00.000Z';
  const entities: UniversalEntity[] = [
    ...(input.locations ?? []).map((location): UniversalEntity => ({
      id: entityIdFromLegacy('location', location.id),
      campaignId,
      kind: 'location',
      title: location.name,
      publicDescription: location.playerView ?? location.description,
      dmNotes: [location.dmSecrets, location.notes].filter(Boolean).join('\n\n') || undefined,
      imageRefs: location.images.map((id) => ({ campaignId, entityId: entityIdFromLegacy('image', id), kind: 'image' })),
      npcRefs: location.npcs.map((id) => ({ campaignId, entityId: entityIdFromLegacy('npc', id), kind: 'npc' })),
      questRefs: location.quests.map((id) => ({ campaignId, entityId: entityIdFromLegacy('quest', id), kind: 'quest' })),
      visibility: PUBLIC_VISIBILITY,
      tags: location.tags,
      sourceIds: [location.id],
      extensions: { original: location },
    })),
    ...(input.npcs ?? []).map((npc): UniversalEntity => ({
      id: entityIdFromLegacy('npc', npc.id),
      campaignId,
      kind: 'npc',
      title: npc.name,
      role: npc.role,
      publicDescription: npc.publicDescription ?? npc.personality,
      dmNotes: [npc.dmNotes, npc.secrets, npc.notes].filter(Boolean).join('\n\n') || undefined,
      locationRef: npc.location ? { campaignId, entityId: entityIdFromLegacy('location', npc.location), kind: 'location' } : undefined,
      imageRef: npc.image ? { campaignId, entityId: entityIdFromLegacy('image', npc.image), kind: 'image' } : undefined,
      visibility: npc.visibleToPlayers === false ? HIDDEN_VISIBILITY : PUBLIC_VISIBILITY,
      tags: npc.tags,
      sourceIds: [npc.id],
      extensions: { original: npc },
    })),
    ...(input.quests ?? []).map((quest): UniversalEntity => ({
      id: entityIdFromLegacy('quest', quest.id),
      campaignId,
      kind: 'quest',
      title: quest.title,
      status: quest.status,
      publicDescription: quest.description,
      dmNotes: quest.notes,
      locationRefs: quest.location ? [{ campaignId, entityId: entityIdFromLegacy('location', quest.location), kind: 'location' }] : undefined,
      npcRefs: quest.giver ? [{ campaignId, entityId: entityIdFromLegacy('npc', quest.giver), kind: 'npc' }] : undefined,
      enemyRefs: Array.isArray(quest.enemies) ? quest.enemies.map((id) => ({ campaignId, entityId: entityIdFromLegacy('enemy', id), kind: 'enemy' })) : undefined,
      imageRef: quest.image ? { campaignId, entityId: entityIdFromLegacy('image', quest.image), kind: 'image' } : undefined,
      visibility: quest.status === 'hidden' ? HIDDEN_VISIBILITY : PUBLIC_VISIBILITY,
      tags: quest.tags,
      sourceIds: [quest.id],
      extensions: { original: quest },
    })),
    ...(input.enemies ?? []).map((enemy): UniversalEntity => ({
      id: entityIdFromLegacy('enemy', enemy.id),
      campaignId,
      kind: 'enemy',
      title: enemy.name,
      ac: enemy.ac,
      hp: enemy.hp,
      cr: enemy.cr,
      publicDescription: enemy.lore,
      dmNotes: [enemy.tactics, enemy.dmNotes].filter(Boolean).join('\n\n') || undefined,
      locationRefs: enemy.locationIds.map((id) => ({ campaignId, entityId: entityIdFromLegacy('location', id), kind: 'location' })),
      imageRef: enemy.image ? { campaignId, entityId: entityIdFromLegacy('image', enemy.image), kind: 'image' } : undefined,
      visibility: HIDDEN_VISIBILITY,
      tags: enemy.tags,
      sourceIds: [enemy.id],
      extensions: { original: enemy },
    })),
    ...(input.players ?? []).map((player): UniversalEntity => ({
      id: entityIdFromLegacy('player', player.id),
      campaignId,
      kind: 'player',
      title: player.characterName,
      playerName: player.playerName,
      publicDescription: player.description,
      dmNotes: [player.dmNotes, player.dmSecrets].filter(Boolean).join('\n\n') || undefined,
      imageRef: player.image ? { campaignId, entityId: entityIdFromLegacy('image', player.image), kind: 'image' } : undefined,
      sheet: { ...player },
      visibility: PUBLIC_VISIBILITY,
      tags: player.tags,
      sourceIds: [player.id],
    })),
    ...(input.factions ?? []).map((faction): UniversalEntity => ({
      id: entityIdFromLegacy('faction', faction.id),
      campaignId,
      kind: 'faction',
      title: faction.name,
      publicDescription: faction.description,
      dmNotes: [faction.goals, faction.resources].filter(Boolean).join('\n\n') || undefined,
      visibility: PUBLIC_VISIBILITY,
      tags: faction.tags,
      sourceIds: [faction.id],
      extensions: { original: faction },
    })),
    ...(input.images ?? []).map((image): UniversalEntity => ({
      id: entityIdFromLegacy('image', image.id),
      campaignId,
      kind: 'image',
      title: image.title,
      src: image.src,
      safeForPlayers: image.safeForPlayers,
      visibility: image.safeForPlayers ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      sourceIds: [image.id],
      extensions: { original: image },
    })),
    ...(input.shops ?? []).map((shop): UniversalEntity => ({
      id: entityIdFromLegacy('shop', shop.id),
      campaignId,
      kind: 'shop',
      title: shop.name,
      publicDescription: shop.description,
      dmNotes: shop.notes,
      relatedRefs: [{ campaignId, entityId: entityIdFromLegacy('location', shop.location), kind: 'location' }],
      visibility: PUBLIC_VISIBILITY,
      tags: shop.tags,
      sourceIds: [shop.id],
      extensions: { original: shop },
    })),
    ...(input.taverns ?? []).map((tavern): UniversalEntity => ({
      id: entityIdFromLegacy('tavern', tavern.id),
      campaignId,
      kind: 'tavern',
      title: tavern.name,
      publicDescription: tavern.description,
      dmNotes: [tavern.notes, tavern.rumors?.join('\n')].filter(Boolean).join('\n\n') || undefined,
      relatedRefs: [{ campaignId, entityId: entityIdFromLegacy('location', tavern.location), kind: 'location' }],
      visibility: PUBLIC_VISIBILITY,
      tags: tavern.tags,
      sourceIds: [tavern.id],
      extensions: { original: tavern },
    })),
  ];

  const durable: CampaignDurableData = {
    maps: [],
    hotspots: [],
    placements: [],
    routes: [],
    entities,
    battleMaps: [],
    battleEntries: [],
    timeline: {},
    calendar: {},
    travel: {},
    economy: {
      economy: input.economy ?? [],
      economyReference: input.economyReference ?? [],
    },
    extensions: {},
  };

  const snapshot = createCampaignSnapshot({
    schemaVersion: makeSchemaVersion('1.0.0'),
    revision: makeRevision(0),
    metadata: {
      campaignId,
      title: input.targetCampaignId,
      kind: 'campaign',
      createdAt: now,
      updatedAt: now,
      sources: [source],
    },
    capabilities: defaultCapabilities(true),
    durable,
    runtime: { campaignId, party: {}, presentation: {}, battles: {}, questStatuses: {}, locationStatuses: {} },
    extensions: {},
    migrationMetadata: [{
      source,
      migratedAt: now,
      adapterVersion: 'dm-companion-adapter.v1',
      dryRun: true,
      aliases: {},
      fieldClassifications: [
        classification('locations', 'mapped'),
        classification('npcs', 'mapped'),
        classification('quests', 'mapped'),
        classification('enemies', 'mapped'),
        classification('players', 'mapped'),
        classification('factions', 'mapped'),
        classification('images', 'mapped'),
        classification('shops', 'mapped'),
        classification('taverns', 'mapped'),
        classification('economy', 'preservedAsExtension'),
        classification('economyReference', 'preservedAsExtension'),
      ],
    }],
  });

  const validation = validateCampaignSnapshot(snapshot);
  return {
    snapshot,
    source,
    classifications: snapshot.migrationMetadata[0].fieldClassifications,
    diagnostics: validation.issues.map((issue) =>
      issue.severity === 'error' ? adapterError(issue.path, issue.code, issue.message) : adapterWarning(issue.path, issue.code, issue.message),
    ),
  };
}
