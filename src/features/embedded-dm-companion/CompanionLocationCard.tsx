import { useState } from 'react';
import type { DmLocation, DmImageItem } from '../../types/dmCompanion';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import { BattleMapThumbnail } from '../../pages/map-workspace/BattleMapThumbnail';
import { CompanionLinkRow } from './CompanionLinkRow';
import { ImageLightbox } from './ImageLightbox';
import { useCampaignStore } from '../../state/campaignStore';

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
}: {
  loc: DmLocation;
  /** Needs enough fields to do the `npc.location === loc.id` reverse
   * lookup and to render a role + portrait per row, not just id/name. */
  npcs: { id: string; name: string; role?: string; location?: string; image?: string; visibleToPlayers?: boolean }[];
  quests: { id: string; title: string; status?: string }[];
  /** Shops located here — `shop.location === loc.id`, same reverse lookup
   * as dm-companion's `shopsAtLocation`. Optional: callers without shop
   * data (e.g. minimal usages) simply omit the "Магазины здесь" section. */
  shops?: { id: string; name: string }[];
  /** Enemies linked here — `enemy.locationIds.includes(loc.id)`, same
   * reverse lookup as dm-companion's `customEnemiesAtLocation`. */
  enemies?: { id: string; name: string }[];
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
}) {
  const store = useCampaignStore();
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
  // Union of the location's own explicit `npcs` array AND every NPC whose
  // `npc.location` reverse-points at this location.
  const npcIdSet = new Set<string>(loc.npcs);
  for (const n of npcs) {
    if (n.location === loc.id) npcIdSet.add(n.id);
  }
  const npcEntries = Array.from(npcIdSet).map((id) => npcs.find((n) => n.id === id) ?? { id, name: id });
  const questItems = loc.quests.map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  const shopItems = (shops ?? []).map((s) => ({ id: s.id, label: s.name }));
  const enemyItems = (enemies ?? []).map((e) => ({ id: e.id, label: e.name }));
  const resolvedImages = (loc.images ?? [])
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
  const linkedBattleMapIds = new Set((battleMapLinks ?? []).map((link) => link.battleMap?.id).filter(Boolean) as string[]);
  const battleMapCandidates = (availableBattleMaps ?? [])
    .filter((bm) => !linkedBattleMapIds.has(bm.id))
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
      </div>
      {hero ? (
        <button type="button" className="companion-source-hero-wrap" onClick={() => setLightboxOpen(true)}>
          <img className="companion-source-hero" src={hero.thumbnailSrc ?? hero.src} alt={loc.name} />
        </button>
      ) : (
        <p className="muted companion-empty-state">Изображение не привязано.</p>
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
      {npcEntries.length ? (
        <div className="companion-npc-row-list">
          {npcEntries.map((n) => {
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
      ) : (
        <p className="muted companion-empty-state">NPC не привязаны.</p>
      )}
      {!!shopItems.length && (
        <>
          <h4>Магазины здесь</h4>
          {onOpenShop ? <CompanionLinkRow items={shopItems} onOpen={onOpenShop} /> : <p>{shopItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Квесты здесь</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
          <div className="player-visibility-npc-list">
            {questItems.map((item) => {
              const quest = quests.find((q) => q.id === item.id);
              if (!quest) return null;
              const visible = quest.status !== 'hidden';
              return revealButton(visible, quest.title, () => store.setQuestStatus(quest.id, visible ? 'hidden' : 'active'));
            })}
          </div>
        </>
      )}
      {!!enemyItems.length && (
        <>
          <h4>Связанные враги</h4>
          {onOpenEnemy ? <CompanionLinkRow items={enemyItems} onOpen={onOpenEnemy} /> : <p>{enemyItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!battleMapLinks?.length && (
        <>
          <h4>Карты битв</h4>
          <div className="companion-battle-map-list">
            {battleMapLinks.map((link) => {
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
          <h4>{battleMapLinks?.length ? 'Добавить карту боя' : 'Карты битв'}</h4>
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
