# Battle Contract

## Durable Definitions

`BattleMapDefinition`

- `id`
- `campaignId`
- `title`
- `variants`
- `gridDefinition`
- `source`
- `externalRefs`
- `extensions`

`BattleEntry`

- `id`
- `campaignId`
- `title`
- `status`
- `battleMapRef`
- `locationRefs`
- `participantRefs`
- `position`
- `visibility`
- `consequences`
- `extensions`

`BattleVariant`

- `id`
- `kind`
- `assetRef`
- `width`
- `height`
- `labels`

`GridDefinition`

- `columns`
- `rows`
- `snap`
- `unit`

`TerrainDefinition`

- `cellKey`
- `type`
- `blocksMovement`
- `costMultiplier`

## Runtime

`BattleRuntime`

- `campaignId`
- `battleId`
- `battleMapRef`
- `active`
- `board`
- `initiative`
- `round`
- `turn`
- `presentation`
- `revision`

`BattleBoard`

- `tokens`
- `terrain`
- `view`
- `showGrid`
- `showTerrain`
- `variant`

`BattleToken`

- `id`
- `name`
- `side`
- `sourceEntityRef`
- `position`
- `currentHp`
- `maxHp`
- `ac`
- `initiative`
- `statuses`

## Rules

- Battle map and battle entry definitions are durable data.
- Active battle, initiative, round, turn, token HP, board view, and terrain edits are runtime.
- `mapRef`/`battleMapRef` is required for persisted battle board runtime.
- UC legacy `battleBoard` migrates to `battleBoards[mapId]` and then to universal `BattleRuntime`.
- Tokenless player edits may update only the presented battle board fields allowed by the command layer.
- No battle runtime may be shared across campaigns.
