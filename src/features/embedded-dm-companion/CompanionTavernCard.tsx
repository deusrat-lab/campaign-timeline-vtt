import { useState } from 'react';
import type { DmTavern, DmImageItem } from '../../types/dmCompanion';
import { resolveEntityPreviewImage } from '../../pages/map-workspace/libraryCards';
import { CompanionLinkRow } from './CompanionLinkRow';
import { PurchaseCart, type BuyableItem } from './PurchaseCart';
import { parseAnyPrice } from './currency';
import { ImageLightbox } from './ImageLightbox';

/**
 * Ported field order/content from dm-companion's real
 * `pages/taverns/TavernDetailPage.tsx`: tags → description → atmosphere →
 * location → owner → staff → menu (with PurchaseCart) → rooms (with
 * PurchaseCart) → services → linked NPC/quests → images → rumors → DM notes.
 *
 * Unlike the earlier stubbed version of this card (which explicitly skipped
 * PurchaseCart "per this stage's explicit scope"), this ported version DOES
 * wire in the real PurchaseCart for both menu items and room bookings — see
 * PurchaseCart.tsx for the local/non-persistent session-state simplification.
 * Menu/room items only get a cart row when they have a parseable numeric
 * price (`parseAnyPrice`); purely descriptive entries (e.g. "по запросу")
 * still render as plain text rows below the cart, same as dm-companion's own
 * `parsePriceString` returning null for those.
 */
export function CompanionTavernCard({
  tavern,
  npcs,
  quests,
  images,
  locationName,
  onOpenNpc,
  onOpenQuest,
  onOpenLocation,
}: {
  tavern: DmTavern;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  images: DmImageItem[];
  /** Bug-fix pass: dm-companion's real TavernDetailPage shows "Локация"
   * (`tavern.location`) right after Атмосфера — this card had the doc
   * comment claiming it but never actually rendered it. */
  locationName?: string;
  onOpenNpc?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
  onOpenLocation?: () => void;
}) {
  const owner = tavern.ownerNpcId ? npcs.find((n) => n.id === tavern.ownerNpcId) : undefined;
  const staffItems = (tavern.staff ?? []).map((id) => ({ id, label: npcs.find((n) => n.id === id)?.name ?? id }));
  const relatedNpcItems = (tavern.relatedNpcs ?? []).map((id) => ({ id, label: npcs.find((n) => n.id === id)?.name ?? id }));
  const relatedQuestItems = (tavern.relatedQuests ?? []).map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  const hero = resolveEntityPreviewImage('tavern', tavern, images);
  const galleryImages = (tavern.relatedImages ?? [])
    .map((id) => images.find((i) => i.id === id))
    .filter((i): i is DmImageItem => !!i);

  const menuCartItems: BuyableItem[] = (tavern.menu ?? [])
    .map((item, i) => {
      const parsed = parseAnyPrice(item.price);
      if (!parsed) return null;
      const result: BuyableItem = { id: `menu-${i}`, name: item.name, meta: item.description ?? undefined, amount: parsed.amount, currency: parsed.currency };
      return result;
    })
    .filter((x): x is BuyableItem => !!x);
  const menuPlainItems = (tavern.menu ?? []).filter((item) => !parseAnyPrice(item.price));

  const roomCartItems: BuyableItem[] = (tavern.rooms ?? [])
    .map((room, i) => {
      const parsed = parseAnyPrice(room.price);
      if (!parsed) return null;
      const result: BuyableItem = { id: `room-${i}`, name: room.name, meta: room.description ?? undefined, amount: parsed.amount, currency: parsed.currency };
      return result;
    })
    .filter((x): x is BuyableItem => !!x);
  const roomPlainItems = (tavern.rooms ?? []).filter((room) => !parseAnyPrice(room.price));
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{tavern.name}</h3>
        <span className="muted">Таверна{tavern.tags?.length ? ` · ${tavern.tags.join(', ')}` : ''}</span>
      </div>
      {hero && (
        <button type="button" className="companion-source-hero-wrap" onClick={() => setLightboxOpen(true)}>
          <img className="companion-source-hero" src={hero.thumbnailSrc ?? hero.src} alt={tavern.name} />
        </button>
      )}
      {hero && lightboxOpen && (
        <ImageLightbox image={{ ...hero, title: hero.title ?? tavern.name }} onClose={() => setLightboxOpen(false)} />
      )}
      <p>{tavern.description}</p>
      {tavern.atmosphere && (
        <>
          <h4>Атмосфера</h4>
          <p>{tavern.atmosphere}</p>
        </>
      )}
      {locationName && (
        <>
          <h4>Локация</h4>
          {onOpenLocation ? (
            <button type="button" className="companion-link-chip" onClick={onOpenLocation}>
              {locationName}
            </button>
          ) : (
            <p>{locationName}</p>
          )}
        </>
      )}
      {(owner || tavern.ownerName) && (
        <>
          <h4>Владелец</h4>
          {owner && onOpenNpc ? (
            <CompanionLinkRow items={[{ id: owner.id, label: owner.name }]} onOpen={onOpenNpc} />
          ) : (
            <p>{owner?.name ?? tavern.ownerName}</p>
          )}
        </>
      )}
      {!!staffItems.length && (
        <>
          <h4>Персонал</h4>
          {onOpenNpc ? <CompanionLinkRow items={staffItems} onOpen={onOpenNpc} /> : <p>{staffItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!tavern.menu?.length && (
        <>
          <h4>Меню</h4>
          {menuCartItems.length > 0 && <PurchaseCart items={menuCartItems} title="Заказ" />}
          {!!menuPlainItems.length && (
            <ul className="companion-item-list">
              {menuPlainItems.map((item, i) => (
                <li key={i}>
                  <strong>{item.name}</strong>
                  {item.price ? ` — ${item.price}` : ''}
                  {item.description ? <span className="muted"> · {item.description}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!!tavern.rooms?.length && (
        <>
          <h4>Комнаты</h4>
          {roomCartItems.length > 0 && <PurchaseCart items={roomCartItems} title="Бронирование" />}
          {!!roomPlainItems.length && (
            <ul className="companion-item-list">
              {roomPlainItems.map((room, i) => (
                <li key={i}>
                  <strong>{room.name}</strong>
                  {room.price ? ` — ${room.price}` : ''}
                  {room.description ? <span className="muted"> · {room.description}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!!tavern.services?.length && (
        <>
          <h4>Услуги</h4>
          <ul>
            {tavern.services.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {!!relatedNpcItems.length && (
        <>
          <h4>Связанные NPC</h4>
          {onOpenNpc ? <CompanionLinkRow items={relatedNpcItems} onOpen={onOpenNpc} /> : <p>{relatedNpcItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!relatedQuestItems.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={relatedQuestItems} onOpen={onOpenQuest} /> : <p>{relatedQuestItems.map((i) => i.label).join(', ')}</p>}
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
      {!!tavern.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {tavern.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {tavern.notes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{tavern.notes}</p>
        </>
      )}
    </div>
  );
}
