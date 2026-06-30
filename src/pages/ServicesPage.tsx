import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import type { CampaignData } from '../data/loadCampaignData';
import type { DmShop, DmShopItem, DmTavern, DmTavernMenuItem, DmTavernRoom } from '../types/dmCompanion';
import { CompanionShopCard } from '../features/embedded-dm-companion/CompanionShopCard';
import { CompanionTavernCard } from '../features/embedded-dm-companion/CompanionTavernCard';

type ServiceKind = 'shop' | 'tavern';
type ServiceItem = { kind: ServiceKind; id: string; title: string; subtitle: string; searchText: string };

function lines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function csv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function selectedLocationLink(data: CampaignData, timelineId: string, locationId: string): string {
  const state = data.locationStates.find((locationState) => locationState.timelineId === timelineId && locationState.locationId === locationId);
  if (state) return `/map?selected=${encodeURIComponent(state.id)}`;
  return `/map`;
}

function locationName(data: CampaignData, id?: string): string {
  return data.locations.find((location) => location.id === id)?.name ?? id ?? '';
}

function isShop(item: DmShop | DmTavern): item is DmShop {
  return Object.prototype.hasOwnProperty.call(item, 'items') || Object.prototype.hasOwnProperty.call(item, 'relationToPlayers');
}

function serviceThumbnail(data: CampaignData, item: DmShop | DmTavern): string | undefined {
  const imageId = isShop(item) ? item.image : item.imageOverrideId ?? item.relatedImages?.[0];
  if (!imageId) return undefined;
  const image = data.images.find((candidate) => candidate.id === imageId);
  return image?.thumbnailSrc ?? image?.src ?? imageId;
}

function buildServiceItems(data: CampaignData): ServiceItem[] {
  return [
    ...data.shops.map((shop) => ({
      kind: 'shop' as const,
      id: shop.id,
      title: shop.name,
      subtitle: [shop.type, locationName(data, shop.location)].filter(Boolean).join(' · '),
      searchText: [shop.name, shop.type, shop.description, shop.relationToPlayers, shop.discounts, shop.notes, ...(shop.tags ?? []), ...(shop.services ?? [])].join(' '),
    })),
    ...data.taverns.map((tavern) => ({
      kind: 'tavern' as const,
      id: tavern.id,
      title: tavern.name,
      subtitle: [tavern.ownerName, locationName(data, tavern.location)].filter(Boolean).join(' · '),
      searchText: [tavern.name, tavern.ownerName, tavern.description, tavern.atmosphere, tavern.notes, ...(tavern.tags ?? []), ...(tavern.services ?? [])].join(' '),
    })),
  ].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}

export function ServicesPage({ initialKind }: { initialKind?: ServiceKind }) {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ServiceKind | 'all'>(initialKind ?? 'all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (initialKind) setKindFilter(initialKind);
  }, [initialKind]);

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return buildServiceItems(data)
      .filter((item) => kindFilter === 'all' || item.kind === kindFilter)
      .filter((item) => {
        if (locationFilter === 'all') return true;
        const source = item.kind === 'shop'
          ? data.shops.find((shop) => shop.id === item.id)
          : data.taverns.find((tavern) => tavern.id === item.id);
        return source?.location === locationFilter;
      })
      .filter((item) => !q || item.searchText.toLocaleLowerCase('ru-RU').includes(q));
  }, [data, kindFilter, locationFilter, query]);

  const locations = useMemo(() => {
    if (!data) return [];
    const ids = new Set([...data.shops.map((shop) => shop.location), ...data.taverns.map((tavern) => tavern.location)].filter(Boolean));
    return Array.from(ids).map((id) => ({ id, name: locationName(data, id) })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [data]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const type = params.get('type') as ServiceKind | null;
    const id = params.get('selected') ?? params.get('id');
    if ((type === 'shop' || type === 'tavern') && id) {
      setSelectedKey(`${type}:${id}`);
      setEditing(false);
    }
  }, [location.search]);

  useEffect(() => {
    if (selectedKey && items.some((item) => `${item.kind}:${item.id}` === selectedKey)) return;
    setSelectedKey(items[0] ? `${items[0].kind}:${items[0].id}` : null);
    setEditing(false);
  }, [items, selectedKey]);

  if (loading) return <p className="page">Загрузка торговли...</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;

  const selectedItem = selectedKey ? items.find((item) => `${item.kind}:${item.id}` === selectedKey) : items[0];
  const selectedShop = selectedItem?.kind === 'shop' ? data.shops.find((shop) => shop.id === selectedItem.id) : undefined;
  const selectedTavern = selectedItem?.kind === 'tavern' ? data.taverns.find((tavern) => tavern.id === selectedItem.id) : undefined;

  return (
    <div className="page services-page">
      <header className="entity-library-header">
        <div>
          <h1>Торговля и отдых</h1>
          <p className="muted">Магазины и таверны из DM Companion с быстрым заказом, покупками, связями и правкой карточек.</p>
        </div>
        <div className="entity-library-actions">
          <Link className="btn-secondary" to="/economy">Экономика</Link>
        </div>
      </header>

      <div className="entity-library-layout">
        <aside className="entity-library-list">
          <input type="search" placeholder="Название, услуга, тег..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="entity-filter-chips">
            <button className={kindFilter === 'all' ? 'active' : ''} onClick={() => setKindFilter('all')}>Все</button>
            <button className={kindFilter === 'shop' ? 'active' : ''} onClick={() => setKindFilter('shop')}>Магазины</button>
            <button className={kindFilter === 'tavern' ? 'active' : ''} onClick={() => setKindFilter('tavern')}>Таверны</button>
          </div>
          <select className="entity-library-filter" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="all">Все локации</option>
            {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <div className="entity-library-count">{items.length} объектов</div>
          <ul>
            {items.map((item) => {
              const active = `${item.kind}:${item.id}` === selectedKey;
              const source = item.kind === 'shop'
                ? data.shops.find((shop) => shop.id === item.id)
                : data.taverns.find((tavern) => tavern.id === item.id);
              const thumb = source ? serviceThumbnail(data, source) : undefined;
              return (
                <li key={`${item.kind}:${item.id}`}>
                  <button className={active ? 'entity-library-row active' : 'entity-library-row'} onClick={() => { setSelectedKey(`${item.kind}:${item.id}`); setEditing(false); }}>
                    {thumb ? <img className="entity-library-row-thumb" src={thumb} alt="" loading="lazy" /> : <span className="entity-library-row-thumb entity-library-row-thumb-fallback">{item.kind === 'shop' ? 'М' : 'Т'}</span>}
                    <span className="entity-library-row-main">
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                      <small className="placement-badge">{item.kind === 'shop' ? 'Магазин' : 'Таверна'}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="entity-library-detail">
          {!selectedItem ? (
            <p className="muted">Ничего не найдено.</p>
          ) : (
            <>
              <div className="entity-library-actions">
                <button className="btn-primary" onClick={() => setEditing((value) => !value)}>{editing ? 'Закрыть редактор' : 'Редактировать'}</button>
                {(selectedShop?.location || selectedTavern?.location) && (
                  <button onClick={() => navigate(selectedLocationLink(data, store.currentTimelineId, (selectedShop ?? selectedTavern)!.location))}>Открыть локацию на карте</button>
                )}
              </div>
              {editing && selectedShop && <ShopServiceEditor shop={selectedShop} data={data} onDone={() => setEditing(false)} />}
              {editing && selectedTavern && <TavernServiceEditor tavern={selectedTavern} data={data} onDone={() => setEditing(false)} />}
              {!editing && selectedShop && (
                <CompanionShopCard
                  shop={selectedShop}
                  npcs={data.npcs}
                  images={data.images}
                  locationName={locationName(data, selectedShop.location)}
                  onOpenNpc={(id) => navigate(`/npc?selected=${encodeURIComponent(id)}`)}
                  onOpenLocation={() => navigate(selectedLocationLink(data, store.currentTimelineId, selectedShop.location))}
                />
              )}
              {!editing && selectedTavern && (
                <CompanionTavernCard
                  tavern={selectedTavern}
                  npcs={data.npcs}
                  quests={data.quests}
                  images={data.images}
                  locationName={locationName(data, selectedTavern.location)}
                  onOpenNpc={(id) => navigate(`/npc?selected=${encodeURIComponent(id)}`)}
                  onOpenQuest={(id) => navigate(`/quests?selected=${encodeURIComponent(id)}`)}
                  onOpenLocation={() => navigate(selectedLocationLink(data, store.currentTimelineId, selectedTavern.location))}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ShopServiceEditor({ shop, data, onDone }: { shop: DmShop; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: shop.name,
    type: shop.type ?? '',
    location: shop.location,
    ownerNpcId: shop.ownerNpcId ?? '',
    description: shop.description ?? '',
    services: (shop.services ?? []).join('\n'),
    relationToPlayers: shop.relationToPlayers ?? '',
    discounts: shop.discounts ?? '',
    rumors: (shop.rumors ?? []).join('\n'),
    notes: shop.notes ?? '',
    tags: (shop.tags ?? []).join(', '),
    itemsText: (shop.items ?? []).map((item) => [item.name, item.category ?? '', item.price ?? '', item.currency ?? 'gp', item.description ?? '', item.availability ?? '', item.quality ?? '', item.notes ?? ''].join(' | ')).join('\n'),
  });

  function parseItems(): DmShopItem[] {
    return draft.itemsText.split('\n').flatMap((line, index) => {
      const [name = '', category = '', price = '', currency = 'gp', description = '', availability = '', quality = '', notes = ''] = line.split('|').map((part) => part.trim());
      if (!name) return [];
      const numericPrice = Number(price.replace(',', '.'));
      return [{
        id: shop.items?.[index]?.id ?? `shop-item-${shop.id}-${index}`,
        name,
        category: category || undefined,
        price: Number.isFinite(numericPrice) && price !== '' ? numericPrice : price,
        currency: currency || undefined,
        description: description || undefined,
        availability: availability || undefined,
        quality: quality || undefined,
        notes: notes || undefined,
        priceSource: shop.items?.[index]?.priceSource,
        hidden: shop.items?.[index]?.hidden,
      }];
    });
  }

  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchShop(shop.id, {
        name: draft.name.trim(),
        type: draft.type.trim(),
        location: draft.location,
        ownerNpcId: draft.ownerNpcId || undefined,
        description: draft.description.trim(),
        services: lines(draft.services),
        relationToPlayers: draft.relationToPlayers.trim(),
        discounts: draft.discounts.trim(),
        rumors: lines(draft.rumors),
        notes: draft.notes.trim(),
        tags: csv(draft.tags),
        items: parseItems(),
      });
      onDone();
    }}>
      <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Тип<input value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} /></label>
      <label>Локация<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>{data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></label>
      <label>Владелец<select value={draft.ownerNpcId} onChange={(e) => setDraft({ ...draft, ownerNpcId: e.target.value })}><option value="">Без NPC</option>{data.npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></label>
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Услуги<textarea value={draft.services} onChange={(e) => setDraft({ ...draft, services: e.target.value })} placeholder="По одной на строку" /></label>
      <label>Отношение к игрокам<textarea value={draft.relationToPlayers} onChange={(e) => setDraft({ ...draft, relationToPlayers: e.target.value })} /></label>
      <label>Скидки<textarea value={draft.discounts} onChange={(e) => setDraft({ ...draft, discounts: e.target.value })} /></label>
      <label>Слухи<textarea value={draft.rumors} onChange={(e) => setDraft({ ...draft, rumors: e.target.value })} placeholder="По одному на строку" /></label>
      <label>Теги<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
      <label>Товары<textarea value={draft.itemsText} onChange={(e) => setDraft({ ...draft, itemsText: e.target.value })} placeholder="Название | Категория | Цена | gp | Описание | Доступность | Качество | Заметки" /></label>
      <label>Заметки ДМ<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <div className="entity-editor-actions">
        <button className="btn-primary" disabled={!draft.name.trim()}>Сохранить</button>
        <button type="button" onClick={onDone}>Отмена</button>
        <button type="button" onClick={() => { store.resetOverride('shop', shop.id); onDone(); }}>Сбросить правки</button>
      </div>
    </form>
  );
}

function TavernServiceEditor({ tavern, data, onDone }: { tavern: DmTavern; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: tavern.name,
    location: tavern.location,
    ownerNpcId: tavern.ownerNpcId ?? '',
    ownerName: tavern.ownerName ?? '',
    description: tavern.description ?? '',
    atmosphere: tavern.atmosphere ?? '',
    services: (tavern.services ?? []).join('\n'),
    rumors: (tavern.rumors ?? []).join('\n'),
    notes: tavern.notes ?? '',
    tags: (tavern.tags ?? []).join(', '),
    staff: tavern.staff ?? [],
    relatedNpcs: tavern.relatedNpcs ?? [],
    relatedQuests: tavern.relatedQuests ?? [],
    menuText: (tavern.menu ?? []).map((item) => [item.name, item.price ?? '', item.description ?? ''].join(' | ')).join('\n'),
    roomsText: (tavern.rooms ?? []).map((room) => [room.name, room.price ?? '', room.description ?? ''].join(' | ')).join('\n'),
  });

  const parseMenu = (): DmTavernMenuItem[] => lines(draft.menuText).map((line) => {
    const [name = '', price = '', description = ''] = line.split('|').map((part) => part.trim());
    return { name, price, description };
  }).filter((item) => item.name);
  const parseRooms = (): DmTavernRoom[] => lines(draft.roomsText).map((line) => {
    const [name = '', price = '', description = ''] = line.split('|').map((part) => part.trim());
    return { name, price, description };
  }).filter((item) => item.name);
  function toggleDraftList(key: 'staff' | 'relatedNpcs' | 'relatedQuests', id: string) {
    setDraft((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(id) ? list.filter((itemId) => itemId !== id) : [...list, id],
      };
    });
  }

  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchTavern(tavern.id, {
        name: draft.name.trim(),
        location: draft.location,
        ownerNpcId: draft.ownerNpcId || undefined,
        ownerName: draft.ownerName.trim(),
        description: draft.description.trim(),
        atmosphere: draft.atmosphere.trim(),
        services: lines(draft.services),
        rumors: lines(draft.rumors),
        notes: draft.notes.trim(),
        tags: csv(draft.tags),
        staff: draft.staff,
        relatedNpcs: draft.relatedNpcs,
        relatedQuests: draft.relatedQuests,
        menu: parseMenu(),
        rooms: parseRooms(),
      });
      onDone();
    }}>
      <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Локация<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>{data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></label>
      <label>Владелец NPC<select value={draft.ownerNpcId} onChange={(e) => setDraft({ ...draft, ownerNpcId: e.target.value })}><option value="">Без NPC</option>{data.npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></label>
      <label>Имя владельца<input value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} /></label>
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Атмосфера<textarea value={draft.atmosphere} onChange={(e) => setDraft({ ...draft, atmosphere: e.target.value })} /></label>
      <fieldset className="entity-editor-linkset">
        <legend>Персонал</legend>
        {data.npcs.map((npc) => (
          <label key={npc.id} className="entity-editor-check">
            <input type="checkbox" checked={draft.staff.includes(npc.id)} onChange={() => toggleDraftList('staff', npc.id)} />
            <span>{npc.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные NPC</legend>
        {data.npcs.map((npc) => (
          <label key={npc.id} className="entity-editor-check">
            <input type="checkbox" checked={draft.relatedNpcs.includes(npc.id)} onChange={() => toggleDraftList('relatedNpcs', npc.id)} />
            <span>{npc.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные квесты</legend>
        {data.quests.map((quest) => (
          <label key={quest.id} className="entity-editor-check">
            <input type="checkbox" checked={draft.relatedQuests.includes(quest.id)} onChange={() => toggleDraftList('relatedQuests', quest.id)} />
            <span>{quest.title}</span>
          </label>
        ))}
      </fieldset>
      <label>Меню<textarea value={draft.menuText} onChange={(e) => setDraft({ ...draft, menuText: e.target.value })} placeholder="Название | Цена | Описание" /></label>
      <label>Комнаты<textarea value={draft.roomsText} onChange={(e) => setDraft({ ...draft, roomsText: e.target.value })} placeholder="Название | Цена | Описание" /></label>
      <label>Услуги<textarea value={draft.services} onChange={(e) => setDraft({ ...draft, services: e.target.value })} /></label>
      <label>Слухи<textarea value={draft.rumors} onChange={(e) => setDraft({ ...draft, rumors: e.target.value })} /></label>
      <label>Теги<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
      <label>Заметки ДМ<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <div className="entity-editor-actions">
        <button className="btn-primary" disabled={!draft.name.trim()}>Сохранить</button>
        <button type="button" onClick={onDone}>Отмена</button>
        <button type="button" onClick={() => { store.resetOverride('tavern', tavern.id); onDone(); }}>Сбросить правки</button>
      </div>
    </form>
  );
}
