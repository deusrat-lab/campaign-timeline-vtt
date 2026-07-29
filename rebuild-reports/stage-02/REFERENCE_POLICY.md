# Reference Policy

## Goals

References must be explicit, campaign-scoped, deterministic, and safe to migrate. The universal engine must never resolve ambiguous semantic ids by first match.

## Reference Kinds

- Hard reference: target must exist in the same snapshot for validation to pass. Example: a battle board's `battleMapRef`.
- Soft reference: target may be missing but must be preserved with a validation warning. Example: imported legacy note pointing to a deleted entity.
- External reference: points to a shared asset, external app, URL, or source file. Example: Battle Map VTT URL or image src.
- Legacy unresolved reference: source value could not be resolved during migration; keep source value and diagnostic.
- Ambiguous reference: source value matches multiple candidates; reject automatic resolution and require explicit reconciliation.
- Deleted target: reference to an entity with tombstone/deleted state; keep tombstone and do not silently retarget.
- Cross-campaign reference: forbidden by default. Allowed only for explicit shared asset references with `scope: "sharedAsset"`.

## ID Strategy

- `CampaignId`: stable string, namespace `camp:<slug-or-source-id>` for migrated records, random/ULID-like for newly created campaigns.
- `EntityId`: campaign-scoped branded string in code; serialized as string.
- `SourceId`: immutable source metadata, never used as sole identity after migration.
- `ExternalId`: original URL, battle-map-vtt id, or file path ref.
- `RuntimeId`: campaign-scoped id for active battle, presentation, UI/runtime records.
- Composite keys are serialized as structured objects where possible; if flattened, use a documented delimiter and store component fields too.

## Resolution Rules

1. Exact universal id match in same campaign.
2. Migration alias exact match in same campaign.
3. Source id exact match within declared source namespace.
4. Semantic/title match only if exactly one candidate exists and the adapter explicitly allows that source.
5. Zero matches becomes unresolved.
6. Two or more matches becomes ambiguous error.

## Preservation Rules

- Valid source fields may be normalized, mapped, or preserved as extensions.
- Valid source fields must not be dropped.
- Invalid source fields are preserved in migration diagnostics where possible.
- Disabled capabilities keep their durable data and extension payloads.
