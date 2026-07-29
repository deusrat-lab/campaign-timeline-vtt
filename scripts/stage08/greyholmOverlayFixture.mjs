// Stage 8d CONTRACT fixture for the Main Campaign (Greyholm) overlay/runtime path.
//
// IMPORTANT: This is a SYNTHETIC contract fixture, NOT a real-data source. It
// exists solely to exercise the adaptMainCampaignToUniversal runtime/overlay
// mapping end-to-end (which Stage 8 never did — Stage 8 fed an empty overlay),
// so any lossy/incorrect runtime mapping is caught at the CONTRACT level. It is
// explicitly NOT evidence of real-data parity. Real Greyholm overlay/runtime
// lives only in browser localStorage (`campaign-timeline-vtt:overlay:v2`) and
// the production server DB, neither of which is available for read-only access.
//
// It is shaped to touch every runtime collection with non-zero values:
// worldMaps (+parent), locationStates, hotspots, placements, routes, party
// position + route progress, reveal, movable entities, campaign events, delayed
// triggers, faction zones, dynamic overlays, battle entries, active battle
// runtime (tokens/initiative/round/current turn/terrain), presented card.

export function buildGreyholmOverlayContractInput() {
  const worldMaps = [
    { id: 'map-region', title: 'Greyholm Region', scope: 'region', level: 'region', originalImageWidth: 2000, originalImageHeight: 1200, isPlayerVisible: true },
    { id: 'map-city-greyholm', title: 'Greyholm City', scope: 'city', level: 'city', parentMapId: 'map-region', originalImageWidth: 1500, originalImageHeight: 1000, isPlayerVisible: false },
  ];
  const worldMapStates = [{ mapStateId: 'map-region__arc-1-peace', mapId: 'map-region', timelineId: 'arc-1-peace' }];
  const locationStates = [
    { id: 'loc-greyholm__arc-1-peace', locationId: 'loc-greyholm', timelineId: 'arc-1-peace', title: 'Greyholm', publicDescription: 'The town of Greyholm.', playerSafeDescription: 'A walled town.', dmNotes: 'SECRET: the mayor is compromised by the Ashen Hand cell.', imageIds: ['img-town'], npcIds: ['npc-mayor'], questIds: ['q-intro'], status: 'visible', tags: ['town'] },
    { id: 'loc-mine__arc-1-peace', locationId: 'loc-mine', timelineId: 'arc-1-peace', title: 'Old Mine', publicDescription: 'An abandoned mine.', dmNotes: 'SECRET: goblin warren three levels down guards the relic.', imageIds: [], npcIds: [], questIds: [], status: 'hidden', tags: ['dungeon'] },
  ];
  const hotspots = [
    { id: 'hs-greyholm', mapId: 'map-region', timelineId: 'arc-1-peace', locationStateId: 'loc-greyholm__arc-1-peace', x: 0.42, y: 0.55, label: 'Greyholm', visibleInPlayerView: true },
  ];
  const placements = [
    { id: 'plc-mayor', arcId: 'arc-1-peace', mapLevel: 'region', mapId: 'map-region', entityKind: 'npc', entityId: 'npc-mayor', title: 'Mayor', position: { x: 0.43, y: 0.56 }, visibleInPlayerView: false, status: 'active' },
  ];
  const routes = [
    { id: 'route-town-mine', mapStateId: 'map-region__arc-1-peace', fromHotspotId: 'hs-greyholm', toHotspotId: 'hs-mine', routeType: 'road', travelTime: '1 day', points: [{ x: 0.42, y: 0.55 }, { x: 0.6, y: 0.62 }], visibleInPlayerView: true },
  ];
  const travelEvents = [{ id: 'te-1', routeId: 'route-town-mine', title: 'Ambush', description: 'Bandits.' }];
  const npcs = [{ id: 'npc-mayor', name: 'Mayor Aldwin', role: 'ruler', publicDescription: 'The town mayor.', personality: 'Stern.', dmNotes: 'SECRET: blackmailed.', secrets: 'Owes the Ashen Hand a debt.', location: 'loc-greyholm', visibleToPlayers: true, tags: ['ruler'] }];
  const quests = [{ id: 'q-intro', title: 'The Missing Miners', status: 'active', description: 'Find the miners.', notes: 'DM: they are dead.', location: 'loc-mine', giver: 'npc-mayor', enemies: ['enemy-goblin'] }];
  const enemies = [{ id: 'enemy-goblin', name: 'Goblin Skirmisher', ac: 13, hp: 11, cr: '1/4', lore: 'Small and vicious.', tactics: 'DM: swarm the weakest PC.', locationIds: ['loc-mine'], tags: ['goblinoid'] }];
  const images = [
    { id: 'img-town', title: 'Greyholm Gate', src: '/img/town.png', safeForPlayers: true },
    { id: 'img-relic', title: 'The Relic (spoiler)', src: '/img/relic.png', safeForPlayers: false },
  ];
  const factions = [{ id: 'fac-ashen', name: 'Ashen Hand', description: 'A secret cult.', goals: 'DM: summon the relic.', tags: ['villain'] }];
  const players = [{ id: 'pc-1', characterName: 'Kira', playerName: 'Sam', description: 'A ranger.', dmNotes: 'DM: secretly hunted.' }];
  const battleMaps = [
    { id: 'bm-mine', title: 'Mine Depths', variants: [{ type: 'day', url: '/bm/mine-day.png' }, { type: 'night', url: '/bm/mine-night.png' }], gridProfile: { columns: 30, rows: 30 } },
    { id: 'bm-town-square', title: 'Town Square', variants: [{ type: 'day', url: '/bm/square.png' }] },
  ];

  const data = {
    timelines: [{ id: 'arc-1-peace', title: 'Arc 1 — Peace' }],
    locationStates, worldMaps, worldMapStates, hotspots, routes, travelEvents, placements,
    battleMaps, npcs, quests, enemies, images, factions,
    locations: [{ id: 'loc-greyholm', name: 'Greyholm' }],
    taverns: [], economy: [], economyReference: [], shops: [], players,
  };

  const overlay = {
    party: {
      currentLocationStateId: 'loc-greyholm__arc-1-peace',
      currentMapPosition: { timelineId: 'arc-1-peace', mapId: 'map-region', mapLevel: 'region', x: 0.42, y: 0.55 },
      visitedLocationStateIds: ['loc-greyholm__arc-1-peace'],
      knownLocationStateIds: ['loc-greyholm__arc-1-peace'],
      revealedLocationStateIds: ['loc-greyholm__arc-1-peace'],
      lastTravelledRouteId: 'route-town-mine',
    },
    calendarsByTimelineId: { 'arc-1-peace': { currentDay: 5, monthName: 'Frostmoon' } },
    eventsById: { 'ev-1': { id: 'ev-1', timelineId: 'arc-1-peace', title: 'Festival', day: 6 } },
    triggersById: { 'tr-1': { id: 'tr-1', timelineId: 'arc-1-peace', fireOnDay: 7, action: 'reveal', targetId: 'loc-mine__arc-1-peace' } },
    factionZonesById: { 'fz-1': { id: 'fz-1', factionId: 'fac-ashen', mapId: 'map-region', status: 'hidden', dmNotes: 'SECRET zone', points: [{ x: 0.1, y: 0.1 }] } },
    dynamicMapOverlaysById: { 'dyn-1': { id: 'dyn-1', mapId: 'map-region', kind: 'weather', payload: { fog: true } } },
    movableEntitiesById: {
      'mv-1': { id: 'mv-1', entityType: 'npc', entityId: 'npc-mayor', timelineId: 'arc-1-peace', currentMapId: 'map-region', mapLevel: 'region', currentPosition: { x: 0.5, y: 0.5 }, movementState: 'idle', visibleInPlayerView: true, updatedAt: '1970-01-01T00:00:00.000Z' },
    },
    battleEntriesById: {
      'be-mine': { id: 'be-mine', timelineId: 'arc-1-peace', name: 'Mine Ambush', description: 'DM ambush', playerSafeDescription: 'Danger below.', sourceLocationStateId: 'loc-mine__arc-1-peace', battleMapId: 'bm-mine', sceneSize: 'standard_30x30', status: 'prepared', linkedEnemyIds: ['enemy-goblin'], linkedNpcIds: ['npc-mayor'], visibleInPlayerView: false, dmNotes: 'SECRET tactics', position: { x: 0.6, y: 0.62 }, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
    },
    partyRouteProgress: { routeId: 'route-town-mine', fromHotspotId: 'hs-greyholm', toHotspotId: 'hs-mine', progress: 0.4 },
    activeBattle: {
      id: 'ab-1', battleMapId: 'bm-mine', sceneId: 'be-mine', locationStateId: 'loc-mine__arc-1-peace', title: 'Mine Ambush',
      variantType: 'night', startedAt: '1970-01-01T00:00:00.000Z', currentTurnCombatantId: 'cmb-kira', round: 2,
      combatants: [
        { id: 'cmb-kira', side: 'player', sourceId: 'pc-1', name: 'Kira', currentHp: 18, maxHp: 24, armorClass: 15, initiative: 17, x: 5, y: 6, row: 6, column: 5 },
        { id: 'cmb-gob1', side: 'enemy', sourceId: 'enemy-goblin', name: 'Goblin A', currentHp: 4, maxHp: 11, armorClass: 13, initiative: 12, x: 8, y: 7, row: 7, column: 8 },
        { id: 'cmb-gob2', side: 'enemy', sourceId: 'enemy-goblin', name: 'Goblin B', currentHp: 11, maxHp: 11, armorClass: 13, initiative: 9, x: 9, y: 9, row: 9, column: 9 },
      ],
      terrainCells: [{ row: 3, column: 3, type: 'blocked' }, { row: 4, column: 4, type: 'difficult' }],
    },
    presentedCard: { type: 'npc', id: 'npc-mayor' },
    currentTimelineId: 'arc-1-peace',
    progress: { questStatusOverrides: { 'q-intro': 'active' }, locationStatusOverrides: { 'loc-mine__arc-1-peace': 'hidden' }, notesByLocationStateId: { 'loc-greyholm__arc-1-peace': 'DM note' } },
  };

  return { data, overlay };
}

// The runtime collections this fixture asserts non-zero coverage for.
export const CONTRACT_RUNTIME_COLLECTIONS = [
  'party.position', 'party.routeProgress', 'reveal', 'movableEntities', 'campaignEvents',
  'delayedTriggers', 'factionZones', 'dynamicOverlays', 'battleEntries', 'activeBattle',
  'tokens', 'initiative', 'round', 'currentTurn', 'terrain', 'presentedCard',
];
