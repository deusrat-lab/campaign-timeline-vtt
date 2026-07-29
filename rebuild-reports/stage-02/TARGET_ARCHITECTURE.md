# Target Universal Campaign Architecture

## Modules

```text
src/domain/
├── campaign/
├── maps/
├── entities/
├── content/
├── runtime/
├── battles/
├── visibility/
├── persistence/
├── validation/
├── adapters/
└── projection/
```

## Snapshot Contract

```text
CampaignSnapshot
├── schemaVersion
├── revision
├── metadata
├── capabilities
├── durable
│   ├── maps
│   ├── entities
│   ├── services
│   ├── timeline
│   ├── travel
│   └── battles
├── runtime
│   ├── activeMap
│   ├── party
│   ├── travel
│   ├── battles
│   └── uiIndependentRuntime
├── visibility
├── extensions
└── migrationMetadata
```

Persistence must save the full canonical snapshot, not a hand-picked subset of known fields.

## Read Flow

1. Route resolves explicit `campaignId`.
2. Campaign Registry resolves campaign metadata.
3. Repository loads `CampaignSnapshot`.
4. Snapshot is validated.
5. Store exposes selectors and commands.
6. Projection layer creates DM/Player/Observer read models.
7. Workspace renders only projection data.

## Write Flow

1. UI dispatches a typed command with explicit `campaignId`.
2. Command validates permissions and capability.
3. Command applies immutable update to durable/runtime/visibility as appropriate.
4. Store marks dirty and records pending revision.
5. Repository compare-and-swap saves expected revision.

## Save and Conflict Flow

1. Load revision `N`.
2. Apply command locally.
3. Save with expected revision `N`.
4. Repository writes revision `N+1` if current revision is still `N`.
5. Stale writes return `CampaignConflict`.
6. UI exposes conflict state; no silent last-write-wins.

## Migration Flow

1. Detect source: MC overlay/base, UC export/blob, DM Companion, battle-map-vtt, synthetic fixture.
2. Create backup.
3. Dry-run adapter builds candidate snapshot.
4. Validate candidate.
5. Reconcile ids and references.
6. Emit mapped/normalized/preserved/unsupported/invalid/ambiguous/dropped classification.
7. Reject valid dropped fields.
8. Save migrated snapshot only after validation.
9. Rollback restores backup.

## Player Safe Flow

1. Universal snapshot remains private.
2. PlayerSafeProjection consumes snapshot and visibility state.
3. Projection strips dmOnly fields and hidden entities.
4. Presented cards are included only as temporary presentation records.

## Observer Flow

Observer projection extends Player Safe with:

- observer focus;
- presented battle;
- presented card;
- read-only battle board state;
- allowed player sheet fields.

## Battle Flow

1. Durable `BattleEntry` links campaign/map/location/entities.
2. Starting battle creates or activates `BattleRuntime`.
3. Board edits update runtime only.
4. Completing battle updates runtime status and optional durable consequences.
5. Player edits are constrained to presented board commands.

## Import/Export Flow

- Export writes canonical `CampaignSnapshot`.
- Legacy-compatible export is adapter output, not repository source of truth.
- Import requires explicit target campaign or explicit create-new mode.
- Import never merges into Greyholm implicitly.

## Server Sync Flow

- Server stores versioned snapshots with revision metadata.
- Main and UC endpoints converge on universal `/api/campaigns/:campaignId`.
- Compatibility endpoints remain until rollback window ends.
- WebSocket messages include campaignId, revision and event kind.

## Rollback Flow

- Every migration creates a backup snapshot.
- Rollback validates backup before restore.
- Restore uses compare-and-swap and emits new revision.
- Legacy compatibility adapters remain until old data can be loaded through universal repository.
