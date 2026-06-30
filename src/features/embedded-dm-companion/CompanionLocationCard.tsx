import { useState } from 'react';
import type { DmLocation, DmImageItem } from '../../types/dmCompanion';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import { BattleMapThumbnail } from '../../pages/map-workspace/BattleMapThumbnail';
import { CompanionLinkRow } from './CompanionLinkRow';
import { ImageLightbox } from './ImageLightbox';
import { useCampaignStore } from '../../state/campaignStore';
import { useCampaignData } from '../../state/campaignDataContext';

function normalizeLinkText(value?: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/№/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function splitLocationNameParts(location: DmLocation): string[] {
  return [location.name, ...(location.aliases ?? [])]
    .flatMap((name) => name.split(/[\/|]/g))
    .map(normalizeLinkText)
    .filter((part) => part.length >= 5);
}

function locationsLookLikeSamePlace(a: DmLocation, b: DmLocation): boolean {
  const aParts = splitLocationNameParts(a);
  const bParts = splitLocationNameParts(b);
  return aParts.some((aPart) =>
    bParts.some((bPart) => aPart === bPart || (aPart.length >= 10 && bPart.includes(aPart)) || (bPart.length >= 10 && aPart.includes(bPart))),
  );
}

function locationTextHaystack(location: DmLocation): string {
  return normalizeLinkText(
    [
      location.name,
      location.description,
      location.atmosphere,
      location.lore,
      location.playerView,
      location.dmSecrets,
      location.notes,
      ...(location.tags ?? []),
      ...(location.aliases ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function locationMentionsEntity(location: DmLocation, entityName?: string): boolean {
  const needle = normalizeLinkText(entityName);
  return needle.length >= 5 && locationTextHaystack(location).includes(needle);
}

/**
 * Ported field order/content from dm-companion's real
 * `pages/locations/LocationDetailPage.tsx`: name/type/region header → hero
 * image → description → atmosphere → lore → "what players see" → rumors →
 * quick scenes → linked NPCs → "Магазины здесь" → linked quests →
 * "Связанные враги" → gallery → DM-only secrets/notes.
 *
 * Bug-fix pass (audit against dm-companion's real LocationDetailPage):
 * - hero/gallery images were previously missing entirely (real page always
 *   shows `imagesForEntity(location.id)[0]` as a hero plus the rest as a
 *   gallery, via `RelatedImages`/`EntityHeroImage`) — added here using
 *   `loc.images` resolved against the `images` prop.
 * - "Магазины здесь" (shops at this location, via `shopsAtLocation` —
 *   `shop.location === loc.id` reverse lookup) was missing — added.
 * - "Связанные враги" (via `customEnemiesAtLocation` — `enemy.locationIds
 *   includes loc.id` reverse lookup) was missing — added.
 *
 * Content/UI pass (Greyholm Region QA): the NPC list previously read ONLY
 * `loc.npcs` (the location's own, often-empty, explicit array). Most NPCs
 * are actually linked the other way around, via `npc.location === loc.id`
 * — the same reverse lookup loadCampaignData.ts's buildLocationStates()
 * already uses to compute LocationState.npcIds — but that reverse link was
 * never consulted here, so a fully-linked NPC could still never appear on
 * this card. Fixed via the same union-of-both-sources pattern, plus each
 * NPC row now shows a role + portrait thumbnail, and an honest empty state
 * ("NPC не привязаны") replaces silently rendering nothing.
 *
 * DM-gating: this card is only ever reached through `isDmMode`-gated entry
 * points (EmbeddedCompanionWindow is only mounted when `isDmMode` is true in
 * MapWorkspacePage.tsx), so the dmSecrets/notes block renders
 * unconditionally here, matching the established convention for every
 * other DM-only block in this directory.
 */
export function CompanionLocationCard({
  loc,
  npcs,
  quests,
  shops,
  enemies,
  images,
  battleMapLinks,
  availableBattleMaps,
  onStartBattle,
  onLinkBattleMap,
  onUnlinkBattleMap,
  onOpenNpc,
  onOpenQuest,
  onOpenShop,
  onOpenEnemy,
  onPlaceLocation,
}: {
  loc: DmLocation;
  /** Needs enough fields to do the `npc.location === loc.id` reverse
   * lookup and to render a role + portrait per row, not just id/name. */
  npcs: { id: string; name: string; role?: string; location?: string; image?: string; visibleToPlayers?: boolean }[];
  quests: { id: string; title: string; status?: string; goal?: string; image?: string; location?: string }[];
  /** Shops located here — `shop.location === loc.id`, same reverse lookup
   * as dm-companion's `shopsAtLocation`. Optional: callers without shop
   * data (e.g. minimal usages) simply omit the "Магазины здесь" section. */
  shops?: { id: string; name: string; description?: string; image?: string }[];
  /** Enemies linked here — `enemy.locationIds.includes(loc.id)`, same
   * reverse lookup as dm-companion's `customEnemiesAtLocation`. */
  enemies?: { id: string; name: string; role?: string; cr?: string; image?: string; locationIds?: string[] }[];
  images?: DmImageItem[];
  battleMapLinks?: { locationStateId: string; battleMap?: BattleMapManifestEntry; confidence: string; manual?: boolean }[];
  availableBattleMaps?: BattleMapManifestEntry[];
  onStartBattle?: (battleMapId: string, locationStateId?: string) => void;
  onLinkBattleMap?: (battleMapId: string) => void;
  onUnlinkBattleMap?: (battleMapId: string, locationStateId: string) => void;
  onOpenNpc?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
  onOpenShop?: (id: string) => void;
  onOpenEnemy?: (id: string) => void;
  onPlaceLocation?: (locationId: string) => void;
}) {
  const store = useCampaignStore();
  const { data } = useCampaignData();
  const revealButton = (visible: boolean, label: string, onToggle: () => void) => (
    <button
      type="button"
      className={visible ? 'player-visibility-chip player-visibility-chip--visible' : 'player-visibility-chip'}
      onClick={onToggle}
      title={visible ? 'Скрыть от игроков' : 'Показать игрокам'}
    >
      {visible ? '👁' : 'скрыто'} · {label}
    </button>
  );
  const currentTimelineArcId = data?.timelines.find((timeline) => timeline.id === store.currentTimelineId)?.arcId;
  const arc2Mode = currentTimelineArcId === 'arc-2';
  const matchingArc1Locations =
    arc2Mode && loc.arcId === 'arc-2'
      ? data?.locations.filter((candidate) => (candidate.arcId ?? 'arc-1') !== 'arc-2' && locationsLookLikeSamePlace(candidate, loc)) ?? []
      : [];
  const arc2Supplements = arc2Mode
    ? data?.locations.filter((candidate) => candidate.arcId === 'arc-2' && candidate.id !== loc.id && locationsLookLikeSamePlace(loc, candidate)) ?? []
    : [];
  const cardLocationSources = arc2Mode
    ? Array.from(new Map([...matchingArc1Locations, loc, ...arc2Supplements].map((source) => [source.id, source])).values())
    : [loc];
  const baseLocationSources = cardLocationSources.filter((source) => (source.arcId ?? 'arc-1') !== 'arc-2');
  const arc2LocationSources = cardLocationSources.filter((source) => source.arcId === 'arc-2');
  const locationArcSections = [
    baseLocationSources.length ? { key: 'arc-1', title: 'Арка 1', sources: baseLocationSources } : undefined,
    arc2LocationSources.length ? { key: 'arc-2', title: 'Арка 2', sources: arc2LocationSources } : undefined,
  ].filter((section): section is { key: string; title: string; sources: DmLocation[] } => !!section);
  const imageSrc = (imageId?: string) => {
    if (!imageId) return undefined;
    if (imageId.startsWith('/') || imageId.startsWith('http') || imageId.startsWith('data:')) return imageId;
    const image = (images ?? []).find((i) => i.id === imageId);
    return image?.thumbnailSrc ?? image?.src;
  };

  function sourceIdSetFor(sources: DmLocation[]) {
    return new Set(sources.map((source) => source.id));
  }

  function buildNpcEntries(sources: DmLocation[]) {
    const sourceIds = sourceIdSetFor(sources);
    const npcIdSet = new Set<string>(sources.flatMap((source) => source.npcs ?? []));
    for (const n of npcs) {
      if (n.location && sourceIds.has(n.location)) npcIdSet.add(n.id);
      if (!n.location && sources.some((source) => locationMentionsEntity(source, n.name))) npcIdSet.add(n.id);
    }
    return Array.from(npcIdSet).map((id) => npcs.find((n) => n.id === id) ?? { id, name: id });
  }

  function buildQuestItems(sources: DmLocation[]) {
    const sourceIds = sourceIdSetFor(sources);
    const questIdSet = new Set<string>(sources.flatMap((source) => source.quests ?? []));
    for (const quest of quests) {
      if (quest.location && sourceIds.has(quest.location)) questIdSet.add(quest.id);
      if (!quest.location && sources.some((source) => locationMentionsEntity(source, quest.title))) questIdSet.add(quest.id);
    }
    return Array.from(questIdSet).map((id) => {
      const quest = quests.find((q) => q.id === id);
      return { id, label: quest?.title ?? id, subtitle: quest?.goal, imageSrc: imageSrc(quest?.image) };
    });
  }

  function buildEnemyItems(sources: DmLocation[]) {
    const sourceIds = sourceIdSetFor(sources);
    return (enemies ?? [])
      .filter((enemy) => {
        const directLink = enemy.locationIds?.some((id) => sourceIds.has(id)) === true;
        const mentionedInLocation = sources.some((source) => locationMentionsEntity(source, enemy.name));
        return directLink || mentionedInLocation;
      })
      .map((e) => ({
        id: e.id,
        label: e.name,
        subtitle: [e.role, e.cr ? `CR ${e.cr}` : undefined].filter(Boolean).join(' · '),
        imageSrc: imageSrc(e.image),
      }));
  }

  const npcSections = locationArcSections
    .map((section) => ({ ...section, items: buildNpcEntries(section.sources) }))
    .filter((section) => section.items.length);
  const questSections = locationArcSections
    .map((section) => ({ ...section, items: buildQuestItems(section.sources) }))
    .filter((section) => section.items.length);
  const enemySections = locationArcSections
    .map((section) => ({ ...section, items: buildEnemyItems(section.sources) }))
    .filter((section) => section.items.length);
  const shopItems = (shops ?? []).map((s) => ({ id: s.id, label: s.name, subtitle: s.description, imageSrc: imageSrc(s.image) }));
  const resolvedImages = cardLocationSources.flatMap((source) => source.images ?? [])
    .map((id) => (images ?? []).find((i) => i.id === id))
    .filter((i): i is DmImageItem => !!i);
  const hero = resolvedImages[0];
  const galleryImages = resolvedImages.slice(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [battleMapSearch, setBattleMapSearch] = useState('');
  const [battleMapToAdd, setBattleMapToAdd] = useState('');
  const normalizeBattleMapSearch = (value: string) =>
    value
      .toLowerCase()
      .replace(/№/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const battleMapVisualKey = (bm?: BattleMapManifestEntry) => {
    if (!bm) return '';
    const variantUrl = bm.variants?.find((variant) => variant.url)?.url ?? bm.variants?.[0]?.url ?? '';
    const assetName = variantUrl.split(/[?#]/)[0].split('/').filter(Boolean).pop();
    if (assetName) return `asset:${assetName.toLowerCase()}`;
    return `meta:${normalizeBattleMapSearch([bm.title, bm.normalizedName, bm.gridSizeLabel, bm.mapSize].filter(Boolean).join(' '))}`;
  };
  const battleMapLinkScore = (link: { confidence: string; manual?: boolean }) => {
    if (link.manual) return 4;
    if (link.confidence === 'exact') return 3;
    if (link.confidence === 'likely') return 2;
    return 1;
  };
  const uniqueBattleMapLinks = Array.from(
    (battleMapLinks ?? []).reduce((map, link) => {
      const bm = link.battleMap;
      const key = bm ? battleMapVisualKey(bm) : `${link.locationStateId}-${link.confidence}`;
      const existing = map.get(key);
      if (!existing || battleMapLinkScore(link) > battleMapLinkScore(existing)) map.set(key, link);
      return map;
    }, new Map<string, { locationStateId: string; battleMap?: BattleMapManifestEntry; confidence: string; manual?: boolean }>()),
  ).map(([, link]) => link);
  const linkedBattleMapIds = new Set((battleMapLinks ?? []).map((link) => link.battleMap?.id).filter(Boolean) as string[]);
  const linkedBattleMapVisualKeys = new Set(uniqueBattleMapLinks.map((link) => battleMapVisualKey(link.battleMap)).filter(Boolean));
  const battleMapCandidates = Array.from(
    (availableBattleMaps ?? [])
      .filter((bm) => !linkedBattleMapIds.has(bm.id) && !linkedBattleMapVisualKeys.has(battleMapVisualKey(bm)))
      .reduce((map, bm) => {
        const key = battleMapVisualKey(bm) || bm.id;
        if (!map.has(key)) map.set(key, bm);
        return map;
      }, new Map<string, BattleMapManifestEntry>())
      .values(),
  )
    .filter((bm) => {
      const q = normalizeBattleMapSearch(battleMapSearch);
      if (!q) return true;
      const haystack = normalizeBattleMapSearch([
        bm.title,
        bm.normalizedName,
        bm.gridSizeLabel,
        bm.mapSize,
        bm.status,
        bm.gridStatus,
        ...(bm.groupLabels ?? []),
      ]
        .filter(Boolean)
        .join(' '));
      return q.split(/\s+/).every((part) => haystack.includes(part));
    })
    .sort((a, b) => {
      const q = normalizeBattleMapSearch(battleMapSearch);
      const aExact = q && normalizeBattleMapSearch(a.title).includes(q) ? 0 : 1;
      const bExact = q && normalizeBattleMapSearch(b.title).includes(q) ? 0 : 1;
      return aExact - bExact || a.title.localeCompare(b.title, 'ru', { numeric: true });
    })
    .slice(0, 80);
  const selectedBattleMapToAdd = battleMapCandidates.find((bm) => bm.id === battleMapToAdd) ?? battleMapCandidates[0];
  const factionLabels = Array.from(new Set([...(loc.factionIds ?? []), loc.primaryFactionId].filter(Boolean) as string[]))
    .map((id) => data?.factions.find((f) => f.id === id || f.name === id || f.shortName === id)?.shortName ?? data?.factions.find((f) => f.id === id || f.name === id || f.shortName === id)?.name ?? id);
  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{loc.name}</h3>
        <span className="muted">
          {loc.type}
          {loc.region ? ` · ${loc.region}` : ''}
        </span>
        {!!loc.tags?.length && (
          <div className="companion-tag-row">
            {loc.tags.map((t) => (
              <span key={t} className="companion-tag-chip">
                {t}
              </span>
            ))}
          </div>
        )}
        {!!factionLabels.length && (
          <div className="companion-tag-row">
            {factionLabels.map((label) => (
              <span key={label} className="companion-tag-chip">{label}</span>
            ))}
          </div>
        )}
        {onPlaceLocation && (
          <div className="actions">
            <button type="button" className="btn-primary btn-compact" onClick={() => onPlaceLocation(loc.id)}>
              Разместить на карте
            </button>
          </div>
        )}
      </div>
      {hero ? (
        <button type="button" className="companion-source-hero-wrap" onClick={() => setLightboxOpen(true)}>
          <img className="companion-source-hero" src={hero.thumbnailSrc ?? hero.src} alt={loc.name} />
        </button>
      ) : (
        <div className="companion-source-hero-wrap companion-source-hero-wrap--empty" aria-label="Изображение не привязано">
          <span className="companion-source-hero-placeholder">Нет изображения</span>
        </div>
      )}
      {hero && revealButton(hero.safeForPlayers !== false, 'арт локации', () => store.patchImage(hero.id, { safeForPlayers: hero.safeForPlayers === false }))}
      {hero && lightboxOpen && <ImageLightbox image={hero} onClose={() => setLightboxOpen(false)} />}
      <p>{loc.description}</p>
      {loc.atmosphere && (
        <>
          <h4>Атмосфера</h4>
          <p>{loc.atmosphere}</p>
        </>
      )}
      {loc.lore && (
        <>
          <h4>Лор</h4>
          <p>{loc.lore}</p>
        </>
      )}
      {loc.playerView && (
        <>
          <h4>Что видят игроки</h4>
          <p>{loc.playerView}</p>
        </>
      )}
      {!!arc2Supplements.length && (
        <>
          <h4>Арка 2 / нововведения</h4>
          {arc2Supplements.map((supplement) => (
            <div key={supplement.id} className="companion-arc-section">
              <strong>{supplement.name}</strong>
              {supplement.description && <p>{supplement.description}</p>}
              {supplement.lore && <p>{supplement.lore}</p>}
              {supplement.playerView && <p className="muted">{supplement.playerView}</p>}
            </div>
          ))}
        </>
      )}
      {!!loc.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {loc.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {!!loc.quickScenes?.length && (
        <>
          <h4>Быстрые сцены</h4>
          <ul>
            {loc.quickScenes.map((s, i) => (
              <li key={i}>
                <strong>{s.title}</strong> — {s.description}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>NPC здесь</h4>
      {npcSections.length ? (
        <>
          {npcSections.map((section) => (
            <div key={section.key} className="companion-arc-section">
              {locationArcSections.length > 1 && <h5>{section.title}</h5>}
              <div className="companion-npc-row-list">
                {section.items.map((n) => {
                  const portrait = n.image ? (images ?? []).find((i) => i.id === n.image) : undefined;
                  const content = (
                    <>
                      {portrait ? (
                        <img className="companion-npc-row-portrait" src={portrait.thumbnailSrc ?? portrait.src} alt={n.name} />
                      ) : (
                        <span className="companion-npc-row-portrait companion-npc-row-portrait-fallback" aria-hidden="true">
                          ?
                        </span>
                      )}
                      <span className="companion-npc-row-text">
                        <strong>{n.name}</strong>
                        {n.role ? <span className="muted"> · {n.role}</span> : null}
                      </span>
                    </>
                  );
                  return onOpenNpc ? (
                    <div key={n.id} className="entity-card-wrap">
                      <button type="button" className="companion-npc-row" onClick={() => onOpenNpc(n.id)}>
                        {content}
                      </button>
                      {revealButton(n.visibleToPlayers === true, n.name, () => store.patchNpc(n.id, { visibleToPlayers: n.visibleToPlayers !== true }))}
                    </div>
                  ) : (
                    <div key={n.id} className="companion-npc-row companion-npc-row-static">
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="muted companion-empty-state">NPC не привязаны.</p>
      )}
      {!!shopItems.length && (
        <>
          <h4>Магазины здесь</h4>
          {onOpenShop ? <CompanionLinkRow items={shopItems} onOpen={onOpenShop} /> : <p>{shopItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!questSections.length && (
        <>
          <h4>Квесты здесь</h4>
          {questSections.map((section) => (
            <div key={section.key} className="companion-arc-section">
              {locationArcSections.length > 1 && <h5>{section.title}</h5>}
              {onOpenQuest ? <CompanionLinkRow items={section.items} onOpen={onOpenQuest} /> : <p>{section.items.map((i) => i.label).join(', ')}</p>}
              <div className="player-visibility-npc-list">
                {section.items.map((item) => {
                  const quest = quests.find((q) => q.id === item.id);
                  if (!quest) return null;
                  const visible = quest.status !== 'hidden';
                  return revealButton(visible, quest.title, () => store.setQuestStatus(quest.id, visible ? 'hidden' : 'active'));
                })}
              </div>
            </div>
          ))}
        </>
      )}
      {!!enemySections.length && (
        <>
          <h4>Связанные враги</h4>
          {enemySections.map((section) => (
            <div key={section.key} className="companion-arc-section">
              {locationArcSections.length > 1 && <h5>{section.title}</h5>}
              {onOpenEnemy ? <CompanionLinkRow items={section.items} onOpen={onOpenEnemy} /> : <p>{section.items.map((i) => i.label).join(', ')}</p>}
            </div>
          ))}
        </>
      )}
      {!!uniqueBattleMapLinks.length && (
        <>
          <h4>Карты битв</h4>
          <div className="companion-battle-map-list">
            {uniqueBattleMapLinks.map((link) => {
              const bm = link.battleMap;
              if (!bm) return null;
              const preview = bm.variants?.find((v) => v.url) ?? bm.variants?.[0];
              return (
                <article key={`${link.locationStateId}-${bm.id}`} className="companion-battle-map-row">
                  <BattleMapThumbnail variant={preview} title={bm.title} size="small" />
                  <div>
                    <strong>{bm.title}</strong>
                    <p className="muted">
                      {bm.gridSizeLabel ?? bm.mapSize ?? 'сетка не указана'}
                      {bm.primarySceneId ? ` · стол: ${bm.scenes?.[0]?.name ?? bm.primarySceneId}` : ''}
                      {link.manual ? ' · вручную привязано' : ` · ${link.confidence}`}
                    </p>
                    {onStartBattle && (
                      <button type="button" className="btn-primary btn-compact" onClick={() => onStartBattle(bm.id, link.locationStateId)}>
                        Начать битву
                      </button>
                    )}
                    {onUnlinkBattleMap && (
                      <button type="button" className="btn-compact" onClick={() => onUnlinkBattleMap(bm.id, link.locationStateId)}>
                        Отвязать
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {onLinkBattleMap && !!availableBattleMaps?.length && (
        <div className="companion-battle-map-add">
          <h4>{uniqueBattleMapLinks.length ? 'Добавить карту боя' : 'Карты битв'}</h4>
          <p className="muted">Привязка сохраняется к этой локации и сразу появляется в карточке.</p>
          <input
            type="search"
            value={battleMapSearch}
            onChange={(e) => {
              setBattleMapSearch(e.target.value);
              setBattleMapToAdd('');
            }}
            placeholder="Поиск по названию, группе, размеру..."
          />
          <div className="companion-battle-map-add-row">
            <select value={selectedBattleMapToAdd?.id ?? ''} onChange={(e) => setBattleMapToAdd(e.target.value)}>
              {battleMapCandidates.length ? (
                battleMapCandidates.map((bm) => (
                  <option key={bm.id} value={bm.id}>
                    {bm.title} · {bm.gridSizeLabel ?? bm.mapSize ?? 'без размера'} · {(bm.groupLabels ?? []).slice(0, 2).join(', ') || 'без группы'}
                  </option>
                ))
              ) : (
                <option value="">Нет доступных карт</option>
              )}
            </select>
            <button
              type="button"
              className="btn-primary btn-compact"
              disabled={!selectedBattleMapToAdd}
              onClick={() => {
                if (!selectedBattleMapToAdd) return;
                onLinkBattleMap(selectedBattleMapToAdd.id);
                setBattleMapToAdd('');
                setBattleMapSearch('');
              }}
            >
              Привязать
            </button>
          </div>
          {selectedBattleMapToAdd && (
            <article className="companion-battle-map-row companion-battle-map-row--preview">
              <BattleMapThumbnail
                variant={selectedBattleMapToAdd.variants?.find((v) => v.url) ?? selectedBattleMapToAdd.variants?.[0]}
                title={selectedBattleMapToAdd.title}
                size="small"
              />
              <div>
                <strong>{selectedBattleMapToAdd.title}</strong>
                <p className="muted">
                  {selectedBattleMapToAdd.gridSizeLabel ?? selectedBattleMapToAdd.mapSize ?? 'сетка не указана'}
                  {(selectedBattleMapToAdd.groupLabels ?? []).length ? ` · ${selectedBattleMapToAdd.groupLabels?.slice(0, 3).join(' · ')}` : ''}
                  {selectedBattleMapToAdd.primarySceneId ? ` · стол: ${selectedBattleMapToAdd.scenes?.[0]?.name ?? selectedBattleMapToAdd.primarySceneId}` : ''}
                </p>
              </div>
            </article>
          )}
        </div>
      )}
      {!!galleryImages.length && (
        <>
          <h4>Изображения</h4>
          <div className="companion-image-gallery">
            {galleryImages.map((img) => (
              <div key={img.id} className="entity-card-wrap">
                <img src={img.thumbnailSrc ?? img.src} alt={img.title} />
                {revealButton(img.safeForPlayers !== false, img.title, () => store.patchImage(img.id, { safeForPlayers: img.safeForPlayers === false }))}
              </div>
            ))}
          </div>
        </>
      )}
      {(loc.dmSecrets || loc.notes) && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          {loc.dmSecrets && <p>{loc.dmSecrets}</p>}
          {loc.notes && <p className="muted">{loc.notes}</p>}
        </>
      )}
    </div>
  );
}
