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
  | { kind: 'presentedCard.present'; targetUniversalId: string; entityKind: string }
  | { kind: 'presentedCard.dismiss' }
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
    }
  | { kind: 'routeProgress.advance'; routeProgress: Record<string, unknown> }
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
      const next = { ...snapshot.visibility.entities };
      if (command.kind === 'reveal.entity') next[id] = PUBLIC_VISIBILITY;
      else delete next[id];
      return {
        accepted: true,
        snapshot: { ...snapshot, visibility: { ...snapshot.visibility, entities: next } },
        changedPaths: [`visibility.entities:${id}`],
        slotKey: `reveal:${id}`,
        targetId: id,
      };
    }
    case 'presentedCard.present': {
      const id = command.targetUniversalId;
      const identity = resolveIdentity(snapshot, { aggregateKind: 'presentedCard', entityId: id, entityKind: command.entityKind });
      if (identity.status !== 'ok') return reject('mapping_failed', `presented card target ${id}: ${identity.status}`);
      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          runtime: {
            ...snapshot.runtime,
            presentation: { ...snapshot.runtime.presentation, presentedCard: { entityRef: id as UniversalPlacement['entityRef'], kind: command.entityKind } },
          },
        },
        changedPaths: ['runtime.presentation.presentedCard'],
        slotKey: 'presentedCard:current',
        targetId: id,
      };
    }
    case 'presentedCard.dismiss': {
      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          runtime: { ...snapshot.runtime, presentation: { ...snapshot.runtime.presentation, presentedCard: null } },
        },
        changedPaths: ['runtime.presentation.presentedCard'],
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
      const party = {
        ...snapshot.runtime.party,
        currentLocationRef: (command.currentLocationRef ?? snapshot.runtime.party.currentLocationRef) as CampaignSnapshot['runtime']['party']['currentLocationRef'],
        currentMapId: (command.currentMapId ?? snapshot.runtime.party.currentMapId) as UniversalMapId | undefined,
        currentMapPosition: command.currentMapPosition
          ? { x: command.currentMapPosition.x, y: command.currentMapPosition.y }
          : snapshot.runtime.party.currentMapPosition,
      };
      return {
        accepted: true,
        snapshot: { ...snapshot, runtime: { ...snapshot.runtime, party } },
        changedPaths: ['runtime.party'],
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
      const party = { ...snapshot.runtime.party, routeProgress: { ...command.routeProgress } };
      const travel = { ...snapshot.durable.travel, partyRouteProgress: { ...command.routeProgress } };
      return {
        accepted: true,
        snapshot: { ...snapshot, runtime: { ...snapshot.runtime, party }, durable: { ...snapshot.durable, travel } },
        changedPaths: ['runtime.party.routeProgress', 'durable.travel.partyRouteProgress'],
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
      return [`visibility.entities:${targetId}`];
    case 'presentedCard':
      return ['runtime.presentation.presentedCard'];
    case 'placement':
      return [`durable.placements:${targetId}`];
    case 'partyLocation':
      return ['runtime.party'];
    case 'routeProgress':
      return ['runtime.party.routeProgress', 'durable.travel.partyRouteProgress'];
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
