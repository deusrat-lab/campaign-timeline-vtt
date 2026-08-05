import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalMapId } from '../campaign/ids';
import type { UniversalPlacement, UniversalPoint } from '../maps/types';
import { PUBLIC_VISIBILITY, HIDDEN_VISIBILITY } from '../visibility/types';
import type { ComplexAggregateKind, ComplexCommandKind } from './complexAuthorityTypes';
import { resolveIdentity } from './aggregateIdentity';

/**
 * TYPED Stage 16 complex commands. Never an arbitrary JSON patch: the command
 * kind selects a closed shape, targets are explicit universal ids resolved
 * deterministically (never first-match, never prefix-guessing), payloads are
 * plain typed values, and each executor mutates only its owned aggregate region
 * of an ISOLATED clone and declares the exact changed path(s).
 */
export type ComplexCommand =
  | { kind: 'reveal.entity'; targetUniversalId: string }
  | { kind: 'reveal.hide'; targetUniversalId: string }
  | {
      kind: 'presentedCard.present';
      targetUniversalId: string;
      entityKind: string;
      /** User-campaign-only: the real legacy action also clears any
       * currently-presented battle in the SAME write (mutual exclusion between
       * showing a card and showing a battle board). Greyholm's presentedCard is
       * genuinely single-slot (no such coupling), so this defaults to false. */
      clearPresentedBattle?: boolean;
    }
  | { kind: 'presentedCard.dismiss'; clearPresentedBattle?: boolean }
  | {
      kind: 'placement.place';
      placementId: string;
      mapId: string;
      entityRef: string;
      entityKind: string;
      position: UniversalPoint;
      title?: string;
      visibleToPlayers: boolean;
    }
  | { kind: 'placement.move'; placementId: string; position: UniversalPoint }
  | { kind: 'placement.remove'; placementId: string }
  | {
      kind: 'partyLocation.move';
      currentLocationRef?: string;
      currentMapId?: string;
      currentMapPosition?: UniversalPoint;
      /** Legacy `SET_CURRENT_LOCATION` semantics: arriving at a location always
       * clears any in-flight map position + route progress atomically. */
      clearMapPosition?: boolean;
      /** Legacy `SET_PARTY_MAP_POSITION` semantics: a direct map move always
       * clears the current location reference (no location while free-moving). */
      clearLocation?: boolean;
      /** Both legacy transitions above always clear route progress; kept as its
       * own flag so a bare partyLocation.move (no arrival/direct-move) can still
       * leave existing route progress untouched (backward compatible default). */
      clearRouteProgress?: boolean;
    }
  | { kind: 'routeProgress.advance'; routeProgress: Record<string, unknown>; clearMapPosition?: boolean }
  | { kind: 'routeProgress.clear' };

export interface ComplexCommandResult {
  accepted: boolean;
  rejectionCode?: 'invalid_payload' | 'mapping_failed' | 'precondition_failed';
  rejectionMessage?: string;
  snapshot: CampaignSnapshot | null;
  changedPaths: string[];
  /** Stable owned-slot key `${aggregateKind}:${targetId}`. */
  slotKey: string | null;
  targetId: string | null;
}

export function aggregateKindOfCommand(kind: ComplexCommandKind): ComplexAggregateKind {
  return kind.split('.')[0] as ComplexAggregateKind;
}

/** Deterministic inverse command kind for the reversible/destructive subset. */
export function inverseCommandKind(kind: ComplexCommandKind): ComplexCommandKind | null {
  switch (kind) {
    case 'reveal.entity':
      return 'reveal.hide';
    case 'reveal.hide':
      return 'reveal.entity';
    case 'presentedCard.present':
      return 'presentedCard.dismiss';
    case 'presentedCard.dismiss':
      return 'presentedCard.present';
    case 'placement.place':
      return 'placement.remove';
    case 'placement.remove':
      return 'placement.place';
    case 'routeProgress.advance':
      return 'routeProgress.clear';
    default:
      return null;
  }
}

function reject(
  code: 'invalid_payload' | 'mapping_failed' | 'precondition_failed',
  message: string,
): ComplexCommandResult {
  return { accepted: false, rejectionCode: code, rejectionMessage: message, snapshot: null, changedPaths: [], slotKey: null, targetId: null };
}

/**
 * Real legacy `presentedCard` mutations (both stacks) always clear ANY
 * currently-presented battle in the same write (`presentedBattle: null` /
 * mutual exclusion between "showing a card" and "showing a battle board").
 * `runtime.battles[mapId].presentedToPlayers` is derived from that legacy
 * field, so a durable presentedCard commit must clear it too — one-directional
 * only (this aggregate only ever CLEARS the flag; Stage 17 battle authority
 * remains the exclusive owner of SETTING it), so there is no ambiguous dual
 * ownership.
 */
function clearPresentedBattles(snapshot: CampaignSnapshot): { battles: CampaignSnapshot['runtime']['battles']; changedPaths: string[] } {
  const entries = Object.entries(snapshot.runtime.battles);
  const changedPaths: string[] = [];
  const battles = Object.fromEntries(
    entries.map(([battleId, battle]) => {
      if (battle.presentedToPlayers) changedPaths.push(`runtime.battles:${battleId}`);
      return [battleId, battle.presentedToPlayers ? { ...battle, presentedToPlayers: false } : battle];
    }),
  );
  return { battles, changedPaths };
}

function isFinitePoint(point: unknown): point is UniversalPoint {
  return (
    !!point &&
    typeof point === 'object' &&
    Number.isFinite((point as UniversalPoint).x) &&
    Number.isFinite((point as UniversalPoint).y)
  );
}

/**
 * Execute a typed complex command against an ISOLATED clone. Pure: no storage,
 * no network, no legacy access. Returns the candidate snapshot, the exact owned
 * changed path(s) and the owned-slot key/target id.
 */
export function executeComplexCommand(base: CampaignSnapshot, command: ComplexCommand): ComplexCommandResult {
  const snapshot = structuredClone(base);
  switch (command.kind) {
    case 'reveal.entity':
    case 'reveal.hide': {
      const id = command.targetUniversalId;
      const identity = resolveIdentity(snapshot, { aggregateKind: 'reveal', entityId: id });
      if (identity.status !== 'ok') return reject('mapping_failed', `reveal target ${id}: ${identity.status}`);
      const reveal = command.kind === 'reveal.entity';
      const next = { ...snapshot.visibility.entities };
      if (reveal) next[id] = PUBLIC_VISIBILITY;
      else delete next[id];
      const changedPaths = [`visibility.entities:${id}`];

      // The real user-campaign `toggleReveal` legacy action is a coupled
      // multi-slot transition: it ALSO flips visibility on any map placement
      // linked to this entity (both directions), and — reveal direction only,
      // matching the legacy asymmetry exactly — the entity's own linked
      // image(s). Expressing this as one atomic candidate (rather than a
      // direct legacy-only write) is required for a durable universal commit to
      // ever match the real legacy post-state. A no-op for campaigns/entities
      // with no linked placements/images (e.g. Greyholm locationState reveal
      // targets, which never resolve a placement/image here).
      const targetVisibility = reveal ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY;
      let placements = snapshot.durable.placements;
      const linkedPlacementIds = placements.filter((p) => p.entityRef === id).map((p) => p.id);
      if (linkedPlacementIds.length > 0) {
        placements = placements.map((p) => (p.entityRef === id ? { ...p, visibility: targetVisibility } : p));
        for (const pid of linkedPlacementIds) changedPaths.push(`durable.placements:${pid}`);
      }
      let entities = snapshot.durable.entities;
      if (reveal) {
        const target = entities.find((e) => e.id === id) as (typeof entities)[number] & {
          imageRef?: { entityId: string };
          imageRefs?: { entityId: string }[];
        };
        const linkedImageIds = new Set<string>();
        if (target?.imageRef) linkedImageIds.add(target.imageRef.entityId);
        if (target?.imageRefs) for (const ref of target.imageRefs) linkedImageIds.add(ref.entityId);
        if (linkedImageIds.size > 0) {
          entities = entities.map((e) =>
            linkedImageIds.has(e.id) ? { ...e, visibility: PUBLIC_VISIBILITY, safeForPlayers: true } : e,
          );
          for (const iid of linkedImageIds) changedPaths.push(`durable.entities:${iid}`);
        }
      }

      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          visibility: { ...snapshot.visibility, entities: next },
          durable: { ...snapshot.durable, placements, entities },
        },
        changedPaths,
        slotKey: `reveal:${id}`,
        targetId: id,
      };
    }
    case 'presentedCard.present': {
      const id = command.targetUniversalId;
      const identity = resolveIdentity(snapshot, { aggregateKind: 'presentedCard', entityId: id, entityKind: command.entityKind });
      if (identity.status !== 'ok') return reject('mapping_failed', `presented card target ${id}: ${identity.status}`);
      const { battles, changedPaths: battleChangedPaths } = command.clearPresentedBattle
        ? clearPresentedBattles(snapshot)
        : { battles: snapshot.runtime.battles, changedPaths: [] as string[] };
      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          runtime: {
            ...snapshot.runtime,
            presentation: { ...snapshot.runtime.presentation, presentedCard: { entityRef: id as UniversalPlacement['entityRef'], kind: command.entityKind } },
            battles,
          },
        },
        changedPaths: ['runtime.presentation.presentedCard', ...battleChangedPaths],
        slotKey: 'presentedCard:current',
        targetId: id,
      };
    }
    case 'presentedCard.dismiss': {
      const { battles, changedPaths: battleChangedPaths } = command.clearPresentedBattle
        ? clearPresentedBattles(snapshot)
        : { battles: snapshot.runtime.battles, changedPaths: [] as string[] };
      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          runtime: { ...snapshot.runtime, presentation: { ...snapshot.runtime.presentation, presentedCard: null }, battles },
        },
        changedPaths: ['runtime.presentation.presentedCard', ...battleChangedPaths],
        slotKey: 'presentedCard:current',
        targetId: 'none',
      };
    }
    case 'placement.place': {
      if (!isFinitePoint(command.position)) return reject('invalid_payload', 'placement position must be finite');
      if (snapshot.durable.placements.some((p) => p.id === command.placementId)) {
        return reject('precondition_failed', `placement ${command.placementId} already exists`);
      }
      const mapId = command.mapId as UniversalMapId;
      const mapIdentity = resolveIdentity(snapshot, { aggregateKind: 'placement', mapId });
      if (mapIdentity.status !== 'ok') return reject('mapping_failed', `placement map ${mapId}: ${mapIdentity.status}`);
      const entityIdentity = resolveIdentity(snapshot, { aggregateKind: 'placement', entityId: command.entityRef, entityKind: command.entityKind });
      if (entityIdentity.status !== 'ok') return reject('mapping_failed', `placement entity ${command.entityRef}: ${entityIdentity.status}`);
      const placement: UniversalPlacement = {
        id: command.placementId,
        campaignId: snapshot.metadata.campaignId,
        mapId,
        entityRef: entityIdentity.universalId as UniversalPlacement['entityRef'],
        entityKind: command.entityKind,
        position: { x: command.position.x, y: command.position.y },
        title: command.title,
        visibility: command.visibleToPlayers ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      };
      return {
        accepted: true,
        snapshot: { ...snapshot, durable: { ...snapshot.durable, placements: [...snapshot.durable.placements, placement] } },
        changedPaths: [`durable.placements:${command.placementId}`],
        slotKey: `placement:${command.placementId}`,
        targetId: command.placementId,
      };
    }
    case 'placement.move': {
      if (!isFinitePoint(command.position)) return reject('invalid_payload', 'placement position must be finite');
      const existing = snapshot.durable.placements.find((p) => p.id === command.placementId);
      if (!existing) return reject('precondition_failed', `placement ${command.placementId} not found`);
      const placements = snapshot.durable.placements.map((p) => {
        if (p.id !== command.placementId) return p;
        const position = { x: command.position.x, y: command.position.y };
        const next: UniversalPlacement = { ...p, position };
        // Mirror the raw-legacy echo (`extensions.original.position`) the adapter
        // rewrites, so the durable candidate stays at parity with the legacy
        // projection (placement echoes are not normalised away like entity ones).
        const original = (p.extensions as Record<string, unknown> | undefined)?.original;
        if (original && typeof original === 'object') {
          next.extensions = { ...(p.extensions as Record<string, unknown>), original: { ...(original as Record<string, unknown>), position } };
        }
        return next;
      });
      return {
        accepted: true,
        snapshot: { ...snapshot, durable: { ...snapshot.durable, placements } },
        changedPaths: [`durable.placements:${command.placementId}`],
        slotKey: `placement:${command.placementId}`,
        targetId: command.placementId,
      };
    }
    case 'placement.remove': {
      const existing = snapshot.durable.placements.find((p) => p.id === command.placementId);
      if (!existing) return reject('precondition_failed', `placement ${command.placementId} not found`);
      const placements = snapshot.durable.placements.filter((p) => p.id !== command.placementId);
      return {
        accepted: true,
        snapshot: { ...snapshot, durable: { ...snapshot.durable, placements } },
        changedPaths: [`durable.placements:${command.placementId}`],
        slotKey: `placement:${command.placementId}`,
        targetId: command.placementId,
      };
    }
    case 'partyLocation.move': {
      if (command.currentLocationRef !== undefined) {
        const identity = resolveIdentity(snapshot, { aggregateKind: 'partyLocation', entityId: command.currentLocationRef });
        if (identity.status !== 'ok') return reject('mapping_failed', `party location ${command.currentLocationRef}: ${identity.status}`);
      }
      if (command.currentMapId !== undefined) {
        const mapIdentity = resolveIdentity(snapshot, { aggregateKind: 'partyLocation', mapId: command.currentMapId as UniversalMapId });
        if (mapIdentity.status !== 'ok') return reject('mapping_failed', `party map ${command.currentMapId}: ${mapIdentity.status}`);
      }
      if (command.currentMapPosition !== undefined && !isFinitePoint(command.currentMapPosition)) {
        return reject('invalid_payload', 'party map position must be finite');
      }
      const clearMapPosition = !!command.clearMapPosition;
      const clearLocation = !!command.clearLocation;
      const clearRouteProgress = !!command.clearRouteProgress;
      const party = {
        ...snapshot.runtime.party,
        currentLocationRef: clearLocation
          ? undefined
          : ((command.currentLocationRef ?? snapshot.runtime.party.currentLocationRef) as CampaignSnapshot['runtime']['party']['currentLocationRef']),
        currentMapId: clearMapPosition ? undefined : ((command.currentMapId ?? snapshot.runtime.party.currentMapId) as UniversalMapId | undefined),
        currentMapPosition: clearMapPosition
          ? undefined
          : command.currentMapPosition
            ? { x: command.currentMapPosition.x, y: command.currentMapPosition.y }
            : snapshot.runtime.party.currentMapPosition,
        routeProgress: clearRouteProgress ? null : snapshot.runtime.party.routeProgress,
      };
      const changedPaths = ['runtime.party'];
      let durable = snapshot.durable;
      if (clearRouteProgress) {
        durable = { ...snapshot.durable, travel: { ...snapshot.durable.travel, partyRouteProgress: null } };
        changedPaths.push('durable.travel.partyRouteProgress');
      }
      return {
        accepted: true,
        snapshot: { ...snapshot, runtime: { ...snapshot.runtime, party }, durable },
        changedPaths,
        slotKey: 'partyLocation:party',
        targetId: command.currentLocationRef ?? 'none',
      };
    }
    case 'routeProgress.advance': {
      if (!command.routeProgress || typeof command.routeProgress !== 'object' || Array.isArray(command.routeProgress)) {
        return reject('invalid_payload', 'routeProgress must be a plain object');
      }
      // The legacy adapter writes party route progress to BOTH runtime.party and
      // durable.travel.partyRouteProgress, so the owned region spans both to keep
      // the durable candidate at parity with the legacy projection.
      const clearMapPosition = !!command.clearMapPosition;
      const party = {
        ...snapshot.runtime.party,
        routeProgress: { ...command.routeProgress },
        currentMapPosition: clearMapPosition ? undefined : snapshot.runtime.party.currentMapPosition,
      };
      const travel = { ...snapshot.durable.travel, partyRouteProgress: { ...command.routeProgress } };
      const changedPaths = ['runtime.party.routeProgress', 'durable.travel.partyRouteProgress'];
      if (clearMapPosition) changedPaths.push('runtime.party.currentMapPosition');
      return {
        accepted: true,
        snapshot: { ...snapshot, runtime: { ...snapshot.runtime, party }, durable: { ...snapshot.durable, travel } },
        changedPaths,
        slotKey: 'routeProgress:party',
        targetId: 'party',
      };
    }
    case 'routeProgress.clear': {
      const party = { ...snapshot.runtime.party, routeProgress: null };
      const travel = { ...snapshot.durable.travel, partyRouteProgress: null };
      return {
        accepted: true,
        snapshot: { ...snapshot, runtime: { ...snapshot.runtime, party }, durable: { ...snapshot.durable, travel } },
        changedPaths: ['runtime.party.routeProgress', 'durable.travel.partyRouteProgress'],
        slotKey: 'routeProgress:party',
        targetId: 'party',
      };
    }
  }
}

/** The owned changed-path prefix(es) for an aggregate + resolved target. A
 * candidate may only change paths equal to or nested under one of these. Most
 * aggregates own a single region; routeProgress owns two (the adapter mirrors it
 * into both runtime.party and durable.travel). */
export function ownedPathPrefixes(aggregateKind: ComplexAggregateKind, targetId: string): string[] {
  switch (aggregateKind) {
    case 'reveal':
      // reveal.entity/hide may ALSO cascade to any linked placement(s) (both
      // directions) and, reveal-direction only, the entity's own linked
      // image(s) — the coarser `durable.placements`/`durable.entities`
      // collection-level prefixes are needed because the affected ids (linked
      // placements/images) are not known ahead of the target entity id itself.
      return [`visibility.entities:${targetId}`, 'durable.placements', 'durable.entities'];
    case 'presentedCard':
      // present/dismiss always clear any currently-presented battle in the same
      // write (see `clearPresentedBattles`) — one-directional only.
      return ['runtime.presentation.presentedCard', 'runtime.battles'];
    case 'placement':
      return [`durable.placements:${targetId}`];
    case 'partyLocation':
      // Arrival/direct-move transitions atomically clear route progress as part
      // of the SAME command (see `clearRouteProgress` above), which mirrors into
      // `durable.travel.partyRouteProgress` — the owned region therefore spans
      // both `runtime.party` and that durable mirror for this aggregate.
      return ['runtime.party', 'durable.travel.partyRouteProgress'];
    case 'routeProgress':
      // `routeProgress.advance` may additionally clear `currentMapPosition`
      // (legacy `SET_PARTY_ROUTE_PROGRESS` semantics) as part of the same atomic
      // transition.
      return ['runtime.party.routeProgress', 'durable.travel.partyRouteProgress', 'runtime.party.currentMapPosition'];
  }
}

/** Read the current owned aggregate-slot value (for hashing / reconciliation).
 * Returns a JSON-serialisable value or null. */
export function readAggregateSlot(
  snapshot: CampaignSnapshot,
  aggregateKind: ComplexAggregateKind,
  targetId: string,
): unknown {
  switch (aggregateKind) {
    case 'reveal':
      return snapshot.visibility.entities[targetId] ?? null;
    case 'presentedCard':
      return snapshot.runtime.presentation.presentedCard ?? null;
    case 'placement':
      return snapshot.durable.placements.find((p) => p.id === targetId) ?? null;
    case 'partyLocation':
      return snapshot.runtime.party ?? null;
    case 'routeProgress':
      return snapshot.runtime.party.routeProgress ?? null;
  }
}
