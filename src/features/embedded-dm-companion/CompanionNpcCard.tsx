import type { DmNpc, DmImageItem } from '../../types/dmCompanion';
import { resolveEntityPreviewImage } from '../../pages/map-workspace/libraryCards';
import { CompanionLinkRow } from './CompanionLinkRow';

/**
 * Ported field order from dm-companion's real `pages/npcs/NpcDetailPage.tsx`:
 * tags/shop badge → race → role → hero image → gallery → location link →
 * shop link → personality → speechStyle → goals → knowledge → secrets
 * (DM-only) → related quests → notes (DM-only). Faction badges are
 * intentionally skipped — campaign-timeline-vtt has no faction-context
 * equivalent to dm-companion's `useFactions()`/`useArcContext()`, and
 * adding one is out of scope for this port.
 */
export function CompanionNpcCard({
  npc,
  locationName,
  shop,
  quests,
  images,
  onOpenQuest,
  onOpenShop,
}: {
  npc: DmNpc;
  locationName?: string;
  shop?: { id: string; name: string };
  quests: { id: string; title: string }[];
  images: DmImageItem[];
  onOpenQuest?: (id: string) => void;
  onOpenShop?: (id: string) => void;
}) {
  const heroImg = images.find((i) => i.id === npc.image);
  const hero = heroImg ?? resolveEntityPreviewImage('npc', npc, images);
  const galleryImages = images.filter((i) => i.relatedEntity === npc.id && i.id !== heroImg?.id);
  const questItems = (npc.relatedQuests ?? []).map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{npc.name}</h3>
        <span className="muted">
          {shop ? 'Торговец' : ''}
          {npc.tags?.length ? `${shop ? ' · ' : ''}${npc.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && <img className="companion-source-hero" src={hero.src} alt={npc.name} />}
      {npc.race && (
        <>
          <h4>Раса</h4>
          <p>{npc.race}</p>
        </>
      )}
      {npc.role && (
        <>
          <h4>Роль</h4>
          <p>{npc.role}</p>
        </>
      )}
      {locationName && (
        <>
          <h4>Локация</h4>
          <p>{locationName}</p>
        </>
      )}
      {shop && (
        <>
          <h4>Магазин</h4>
          {onOpenShop ? <CompanionLinkRow items={[{ id: shop.id, label: shop.name }]} onOpen={onOpenShop} /> : <p>{shop.name}</p>}
        </>
      )}
      {npc.personality && (
        <>
          <h4>Характер</h4>
          <p>{npc.personality}</p>
        </>
      )}
      {npc.speechStyle && (
        <>
          <h4>Манера речи</h4>
          <p>{npc.speechStyle}</p>
        </>
      )}
      {npc.goals && (
        <>
          <h4>Цели</h4>
          <p>{npc.goals}</p>
        </>
      )}
      {npc.knowledge && (
        <>
          <h4>Знания</h4>
          <p>{npc.knowledge}</p>
        </>
      )}
      {npc.secrets && (
        <>
          <h4>Секреты (DM-ONLY)</h4>
          <p>{npc.secrets}</p>
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
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
      {(npc.notes || npc.dmNotes) && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          {npc.notes && <p className="muted">{npc.notes}</p>}
          {npc.dmNotes && <p className="muted">{npc.dmNotes}</p>}
        </>
      )}
    </div>
  );
}
