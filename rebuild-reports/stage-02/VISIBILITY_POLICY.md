# Visibility Policy

## Core States

- `dmOnly`: exists only in DM projections.
- `hidden`: exists in durable data but is not visible to players/observer.
- `revealed`: entity existence is visible to players.
- `playerSafe`: specific fields/assets are safe for player projection.
- `observerVisible`: visible in observer projection.
- `public`: visible without campaign-secret context.
- `presented`: temporarily pushed to player/observer view without necessarily changing permanent reveal state.

## Separation Rules

The universal model separates:

- entity existence;
- entity reveal;
- field-level reveal;
- asset/image safety;
- map marker visibility;
- current presentation;
- observer focus;
- runtime edit permission.

## Projection Rules

- DM projection may include all fields plus diagnostics.
- Player Safe projection includes revealed entities and player-safe fields only.
- Observer projection is Player Safe plus observer runtime focus/presentation/battle state.
- Raw repository snapshots are never the player/observer payload.
- Presentation does not permanently reveal unless a command explicitly changes reveal state.

## Migration Rules

- MC `visibleToPlayers`, `safeForPlayers`, `playerSafeDescription`, `publicDescription`, placement visibility, event visibility, battle entry visibility, and `presentedCard` map into separate visibility records.
- UC `revealedToPlayers`, `playerSafe`, `visibleToPlayers`, `presentedBattle`, and `presentedCard` map into the same visibility model.
- Missing visibility source defaults to conservative `hidden` for DM-only entities and `public` only for explicitly public world/map assets.
