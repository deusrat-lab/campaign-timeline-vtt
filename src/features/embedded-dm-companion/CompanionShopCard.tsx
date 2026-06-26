import { useState } from 'react';
import type { DmShop, DmImageItem } from '../../types/dmCompanion';
import { resolveEntityPreviewImage } from '../../pages/map-workspace/libraryCards';
import { CompanionLinkRow } from './CompanionLinkRow';
import { PurchaseCart, type BuyableItem } from './PurchaseCart';
import { parseAnyPrice } from './currency';
import { ImageLightbox } from './ImageLightbox';

/**
 * Ported field order/content from dm-companion's real
 * `pages/shops/ShopDetailPage.tsx`: tags → image → description → relation
 * to players → discounts → rumors → owner → services → goods (grouped by
 * category, with PurchaseCart) → DM notes.
 *
 * Goods are grouped by `item.category` — dm-companion's own ShopDetailPage
 * groups goods by category too (confirmed against the real source), so this
 * isn't a deviation, just porting that grouping along with the rest.
 *
 * Unlike the earlier stub, the real PurchaseCart is now wired in for every
 * item with a numeric-parseable price; items with purely descriptive prices
 * (e.g. quest-only items marked "не продаётся") render as plain rows below
 * each category's cart, same convention as the tavern card.
 */
export function CompanionShopCard({
  shop,
  npcs,
  images,
  locationName,
  onOpenNpc,
  onOpenLocation,
}: {
  shop: DmShop;
  npcs: { id: string; name: string }[];
  images: DmImageItem[];
  /** Bug-fix pass: dm-companion's real ShopDetailPage shows "Локация"
   * (`shop.location`) right after Слухи — this card was missing it. */
  locationName?: string;
  onOpenNpc?: (id: string) => void;
  onOpenLocation?: () => void;
}) {
  const owner = shop.ownerNpcId ? npcs.find((n) => n.id === shop.ownerNpcId) : undefined;
  const hero = resolveEntityPreviewImage('shop', shop, images);
  const itemsByCategory = new Map<string, NonNullable<DmShop['items']>>();
  for (const item of shop.items ?? []) {
    const cat = item.category ?? 'Прочее';
    const list = itemsByCategory.get(cat) ?? [];
    list.push(item);
    itemsByCategory.set(cat, list);
  }
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{shop.name}</h3>
        <span className="muted">
          {shop.type ?? 'Лавка'}
          {shop.tags?.length ? ` · ${shop.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && (
        <button type="button" className="companion-source-hero-wrap" onClick={() => setLightboxOpen(true)}>
          <img className="companion-source-hero" src={hero.thumbnailSrc ?? hero.src} alt={shop.name} />
        </button>
      )}
      {hero && lightboxOpen && (
        <ImageLightbox image={{ ...hero, title: hero.title ?? shop.name }} onClose={() => setLightboxOpen(false)} />
      )}
      <p>{shop.description}</p>
      {shop.relationToPlayers && (
        <>
          <h4>Отношение к игрокам</h4>
          <p>{shop.relationToPlayers}</p>
        </>
      )}
      {shop.discounts && (
        <>
          <h4>Скидки</h4>
          <p>{shop.discounts}</p>
        </>
      )}
      {!!shop.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {shop.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
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
      {owner && (
        <>
          <h4>Владелец</h4>
          {onOpenNpc ? (
            <CompanionLinkRow items={[{ id: owner.id, label: owner.name }]} onOpen={onOpenNpc} />
          ) : (
            <p>{owner.name}</p>
          )}
        </>
      )}
      {!!shop.services?.length && (
        <>
          <h4>Услуги</h4>
          <ul>
            {shop.services.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {itemsByCategory.size > 0 && (
        <>
          <h4>Товары</h4>
          {Array.from(itemsByCategory.entries()).map(([cat, items]) => {
            const cartItems: BuyableItem[] = items
              .map((item) => {
                const parsed = parseAnyPrice(item.price, item.currency);
                if (!parsed) return null;
                const metaParts = [item.description, item.availability].filter(Boolean);
                const result: BuyableItem = { id: item.id, name: item.name, meta: metaParts.join(' · ') || undefined, amount: parsed.amount, currency: parsed.currency };
                return result;
              })
              .filter((x): x is BuyableItem => !!x);
            const plainItems = items.filter((item) => !parseAnyPrice(item.price, item.currency));
            return (
              <div key={cat} className="companion-goods-category">
                <strong className="muted">{cat}</strong>
                {cartItems.length > 0 && <PurchaseCart items={cartItems} title="Покупка" />}
                {!!plainItems.length && (
                  <ul className="companion-item-list">
                    {plainItems.map((item) => (
                      <li key={item.id}>
                        <strong>{item.name}</strong>
                        {item.price !== undefined && item.price !== '' ? ` — ${item.price}${item.currency ? ` ${item.currency}` : ''}` : ''}
                        {item.description ? <span className="muted"> · {item.description}</span> : null}
                        {item.availability ? <span className="muted"> ({item.availability})</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}
      {shop.notes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{shop.notes}</p>
        </>
      )}
    </div>
  );
}
