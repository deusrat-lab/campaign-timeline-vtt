import { useState } from 'react';
import type { DmLocation, DmImageItem } from '../../types/dmCompanion';
import { CompanionLinkRow } from './CompanionLinkRow';
import { ImageLightbox } from './ImageLightbox';

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
  onOpenNpc,
  onOpenQuest,
  onOpenShop,
  onOpenEnemy,
}: {
  loc: DmLocation;
  /** Needs enough fields to do the `npc.location === loc.id` reverse
   * lookup and to render a role + portrait per row, not just id/name. */
  npcs: { id: string; name: string; role?: string; location?: string; image?: string }[];
  quests: { id: string; title: string }[];
  /** Shops located here — `shop.location === loc.id`, same reverse lookup
   * as dm-companion's `shopsAtLocation`. Optional: callers without shop
   * data (e.g. minimal usages) simply omit the "Магазины здесь" section. */
  shops?: { id: string; name: string }[];
  /** Enemies linked here — `enemy.locationIds.includes(loc.id)`, same
   * reverse lookup as dm-companion's `customEnemiesAtLocation`. */
  enemies?: { id: string; name: string }[];
  images?: DmImageItem[];
  onOpenNpc?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
  onOpenShop?: (id: string) => void;
  onOpenEnemy?: (id: string) => void;
}) {
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
              <button key={n.id} type="button" className="companion-npc-row" onClick={() => onOpenNpc(n.id)}>
                {content}
              </button>
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
        </>
      )}
      {!!enemyItems.length && (
        <>
          <h4>Связанные враги</h4>
          {onOpenEnemy ? <CompanionLinkRow items={enemyItems} onOpen={onOpenEnemy} /> : <p>{enemyItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!galleryImages.length && (
        <>
          <h4>Изображения</h4>
          <div className="companion-image-gallery">
            {galleryImages.map((img) => (
              <img key={img.id} src={img.thumbnailSrc ?? img.src} alt={img.title} />
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
