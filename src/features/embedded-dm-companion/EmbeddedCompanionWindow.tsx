import { useEffect, useState } from 'react';
import type { CampaignData } from '../../data/loadCampaignData';
import { useCampaignStore } from '../../state/campaignStore';
import { effectiveQuestStatus } from '../../data/selectors';
import { getPlacementVisibilityState, getVisibilityLabel } from '../../data/visibility';
import type { DmImageItem, DmLocation, DmQuest, DmShop, DmTavern } from '../../types/dmCompanion';
import type { QuestStatus, BattleEntry } from '../../types';
import { CompanionLocationCard } from './CompanionLocationCard';
import { CompanionTavernCard } from './CompanionTavernCard';
import { CompanionShopCard } from './CompanionShopCard';
import { CompanionNpcCard } from './CompanionNpcCard';
import { CompanionQuestCard } from './CompanionQuestCard';
import { CompanionEnemyCard } from './CompanionEnemyCard';
import { CompanionImageCard } from './CompanionImageCard';
import { CompanionBattleEntryCard } from './CompanionBattleEntryCard';
import { EntityEditor } from '../../pages/EntityLibraryPage';

/**
 * The shared embedded-companion navigation entity. Names kept as
 * `EmbeddedCompanionEntity` / `EmbeddedCompanionWindow` / `openCompanion`
 * (NOT renamed to `openDmCompanionEntity`/`EmbeddedDmCompanionHost` as the
 * task spec allowed as an option) — see the module doc in
 * MapWorkspacePage.tsx next to `openCompanion` for why: ~13 call sites
 * across MapWorkspacePage.tsx already use these exact names, a rename
 * would touch every one of them for purely cosmetic benefit, and the
 * existing names already read clearly ("open the companion window for this
 * entity"). This is a deliberate, documented decision, not an oversight.
 *
 * `battleEntry` is included as a full first-class member now that
 * CompanionBattleEntryCard exists (the old version had a placeholder for
 * any non-location/tavern/shop/npc type; quest/enemy/image/battleEntry are
 * now all real).
 */
export type EmbeddedCompanionEntity =
  | { type: 'location'; id: string }
  | { type: 'tavern'; id: string }
  | { type: 'shop'; id: string }
  | { type: 'npc'; id: string }
  | { type: 'quest'; id: string }
  | { type: 'enemy'; id: string }
  | { type: 'image'; id: string }
  | { type: 'battleEntry'; id: string };

const QUEST_STATUS_ORDER: QuestStatus[] = ['active', 'completed', 'failed', 'hidden'];
/** Noun-form display label ("Статус квеста: Активен"), matching
 * MapWorkspacePage.tsx's own QUEST_STATUS_LABELS exactly. */
const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: 'Активен',
  completed: 'Завершён',
  failed: 'Провален',
  hidden: 'Скрыт',
};
/** Verb-form action-button label for "set status to X". */
const QUEST_STATUS_ACTION_LABELS: Record<QuestStatus, string> = {
  active: 'Активировать',
  completed: 'Завершить',
  failed: 'Провалить',
  hidden: 'Скрыть',
};

function imageSrcFromId(data: CampaignData, imageId?: string): string | undefined {
  if (!imageId) return undefined;
  if (imageId.startsWith('/') || imageId.startsWith('http') || imageId.startsWith('data:')) return imageId;
  const image = imageId ? data.images.find((item) => item.id === imageId) : undefined;
  return image?.thumbnailSrc ?? image?.src;
}

function InlineImagePicker({
  label = 'Изображение',
  value,
  data,
  onChange,
}: {
  label?: string;
  value: string;
  data: CampaignData;
  onChange: (value: string) => void;
}) {
  const preview = imageSrcFromId(data, value);
  return (
    <label>
      {label}
      <div className="inline-image-picker">
        {preview ? <img src={preview} alt="" /> : <span>Нет изображения</span>}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Нет изображения</option>
          {data.images.map((image) => <option key={image.id} value={image.id}>{image.title}</option>)}
        </select>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') onChange(reader.result);
            };
            reader.readAsDataURL(file);
            e.currentTarget.value = '';
          }}
        />
      </div>
    </label>
  );
}

export function EmbeddedCompanionWindow({
  entity,
  hasBack,
  onBack,
  onClose,
  onOpen,
  data,
  npcs: _npcs,
  quests: _quests,
  onStartBattle,
  onPlaceLocation,
}: {
  entity: EmbeddedCompanionEntity;
  hasBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onOpen: (entity: EmbeddedCompanionEntity) => void;
  data: CampaignData;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  onStartBattle?: (battleMapId: string, locationStateId?: string) => void;
  onPlaceLocation?: (locationId: string) => void;
}) {
  const store = useCampaignStore();
  const [inlineEditing, setInlineEditing] = useState(false);
  const openNpc = (id: string) => onOpen({ type: 'npc', id });
  const openQuest = (id: string) => onOpen({ type: 'quest', id });
  const openShop = (id: string) => onOpen({ type: 'shop', id });
  const openLocation = (id: string) => onOpen({ type: 'location', id });
  const openEnemy = (id: string) => onOpen({ type: 'enemy', id });

  useEffect(() => {
    setInlineEditing(false);
  }, [entity.type, entity.id]);

  let title: string;
  let body: React.ReactNode;
  /** Hotfix — restores the quest status lifecycle toggle (active/completed/
   * failed/hidden). This used to live in the old EntityDrawer 'quest'
   * popup; once marker clicks were redirected to openCompanion (see
   * openLinkedEntity's "Bug-fix pass" comment in MapWorkspacePage.tsx),
   * that drawer branch became unreachable dead code and store.setQuestStatus
   * had no remaining call site at all — silently dropping the only way to
   * change a quest's status. Set below only when entity.type === 'quest'. */
  let questForStatus: DmQuest | undefined;
  /** Visibility-pass continuation — BattleEntry has no MapObjectPlacement
   * record (see the "Действия на карте" comment below), so its own
   * status/visibleInPlayerView fields need a dedicated reveal/hide block
   * instead of the generic placement lookup. Set below only when
   * entity.type === 'battleEntry' and the entry resolves. */
  let battleEntryForVisibility: BattleEntry | undefined;

  if (entity.type === 'location') {
    const loc = data.locations.find((l) => l.id === entity.id);
    title = loc?.name ?? 'Локация';
    // Bug-fix pass (audit: "Рыночная площадь") — dm-companion's real
    // LocationDetailPage also shows "Магазины здесь" (shops with
    // `shop.location === loc.id`) and "Связанные враги"
    // (`enemy.locationIds.includes(loc.id)`); both are reverse lookups,
    // same as it does, not stored directly on DmLocation.
    const shopsHere = loc ? data.shops.filter((s) => s.location === loc.id) : [];
    const locationStatesHere = loc ? data.locationStates.filter((ls) => ls.locationId === loc.id) : [];
    const locationStateIdsHere = new Set(locationStatesHere.map((ls) => ls.id));
    const battleMapLinkByKey = new Map(
      data.battleMapLocationLinks
        .filter((link) => locationStateIdsHere.has(link.locationStateId) && !link.rejected)
        .map((link) => [`${link.locationStateId}__${link.battleMapId}`, link]),
    );
    for (const override of Object.values(store.battleMapLocationLinkOverrides)) {
      if (override.rejected || !locationStateIdsHere.has(override.locationStateId)) continue;
      battleMapLinkByKey.set(`${override.locationStateId}__${override.battleMapId}`, override);
    }
    const battleMapLinksHere = Array.from(battleMapLinkByKey.values()).map((link) => ({
      locationStateId: link.locationStateId,
      battleMap: data.battleMaps.find((bm) => bm.id === link.battleMapId),
      confidence: link.confidence,
      manual: link.manual,
    }));
    body = loc ? (
      <CompanionLocationCard
        loc={loc}
        npcs={data.npcs}
        quests={data.quests}
        shops={shopsHere}
        enemies={data.enemies}
        images={data.images}
        battleMapLinks={battleMapLinksHere}
        availableBattleMaps={data.battleMaps}
        onStartBattle={onStartBattle}
        onLinkBattleMap={(battleMapId) => {
          const targetLocationState = locationStatesHere[0];
          if (!targetLocationState) return;
          store.addManualBattleMapLink(targetLocationState.id, battleMapId, 'Manual link from location card');
        }}
        onUnlinkBattleMap={(battleMapId, locationStateId) => {
          store.removeBattleMapLink(locationStateId, battleMapId);
        }}
        onOpenNpc={openNpc}
        onOpenQuest={openQuest}
        onOpenShop={openShop}
        onOpenEnemy={openEnemy}
        onPlaceLocation={onPlaceLocation}
      />
    ) : (
      <p className="muted">Локация не найдена.</p>
    );
  } else if (entity.type === 'tavern') {
    const tavern = data.taverns.find((t) => t.id === entity.id);
    title = tavern?.name ?? 'Таверна';
    const tavernLoc = tavern ? data.locations.find((l) => l.id === tavern.location) : undefined;
    body = tavern ? (
      <CompanionTavernCard
        tavern={tavern}
        npcs={data.npcs}
        quests={data.quests}
        images={data.images}
        locationName={tavernLoc?.name}
        onOpenNpc={openNpc}
        onOpenQuest={openQuest}
        onOpenLocation={tavernLoc ? () => openLocation(tavernLoc.id) : undefined}
      />
    ) : (
      <p className="muted">Таверна не найдена.</p>
    );
  } else if (entity.type === 'shop') {
    const shop = data.shops.find((s) => s.id === entity.id);
    title = shop?.name ?? 'Лавка';
    const shopLoc = shop ? data.locations.find((l) => l.id === shop.location) : undefined;
    body = shop ? (
      <CompanionShopCard
        shop={shop}
        npcs={data.npcs}
        images={data.images}
        locationName={shopLoc?.name}
        onOpenNpc={openNpc}
        onOpenLocation={shopLoc ? () => openLocation(shopLoc.id) : undefined}
      />
    ) : (
      <p className="muted">Лавка не найдена.</p>
    );
  } else if (entity.type === 'npc') {
    const npc = data.npcs.find((n) => n.id === entity.id);
    title = npc?.name ?? 'NPC';
    const loc = npc ? data.locations.find((l) => l.id === npc.location) : undefined;
    const shop = npc ? data.shops.find((s) => s.ownerNpcId === npc.id) : undefined;
    body = npc ? (
      <CompanionNpcCard npc={npc} locationName={loc?.name} shop={shop} quests={data.quests} images={data.images} onOpenQuest={openQuest} onOpenShop={openShop} />
    ) : (
      <p className="muted">NPC не найден.</p>
    );
  } else if (entity.type === 'quest') {
    const quest = data.quests.find((q) => q.id === entity.id);
    title = quest?.title ?? 'Квест';
    const loc = quest ? data.locations.find((l) => l.id === quest.location) : undefined;
    body = quest ? (
      <CompanionQuestCard
        quest={quest}
        npcs={data.npcs}
        enemies={data.enemies}
        images={data.images}
        locationName={loc?.name}
        onOpenNpc={openNpc}
	        onOpenLocation={openLocation}
	        onOpenEnemy={openEnemy}
          onEditEnemy={openEnemy}
          onRemoveEnemy={(enemyId) => {
            store.patchQuest(quest.id, { enemies: (quest.enemies ?? []).filter((id) => id !== enemyId) });
            const enemy = data.enemies.find((e) => e.id === enemyId);
            if (enemy) store.patchEnemy(enemy.id, { questIds: (enemy.questIds ?? []).filter((id) => id !== quest.id) });
          }}
	      />
    ) : (
      <p className="muted">Квест не найден.</p>
    );
    questForStatus = quest;
  } else if (entity.type === 'enemy') {
    const enemy = data.enemies.find((e) => e.id === entity.id);
    title = enemy?.name ?? 'Враг';
    body = enemy ? (
      <CompanionEnemyCard enemy={enemy} locations={data.locations} quests={data.quests} images={data.images} onOpenLocation={openLocation} onOpenQuest={openQuest} />
    ) : (
      <p className="muted">Враг не найден.</p>
    );
  } else if (entity.type === 'image') {
    const image = data.images.find((i) => i.id === entity.id);
    title = image?.title ?? 'Изображение';
    if (!image) {
      body = <p className="muted">Изображение не найдено.</p>;
    } else {
      const loc = image.relatedEntity ? data.locations.find((l) => l.id === image.relatedEntity) : undefined;
      const npc = image.relatedEntity ? data.npcs.find((n) => n.id === image.relatedEntity) : undefined;
      const enemy = image.relatedEntity ? data.enemies.find((e) => e.id === image.relatedEntity) : undefined;
      const questItems = (image.linkedQuestIds ?? []).map((id) => {
        const quest = data.quests.find((q) => q.id === id);
        return {
          id,
          label: quest?.title ?? id,
          subtitle: quest?.goal,
          imageSrc: imageSrcFromId(data, quest?.image),
        };
      });
      body = (
        <CompanionImageCard
          image={image}
          locationName={loc?.name}
          npcName={npc?.name}
          enemyName={enemy?.name}
          questItems={questItems}
          onOpenLocation={loc ? () => openLocation(loc.id) : undefined}
          onOpenNpc={npc ? () => openNpc(npc.id) : undefined}
          onOpenEnemy={enemy ? () => openEnemy(enemy.id) : undefined}
          onOpenQuest={openQuest}
        />
      );
    }
  } else {
    // entity.type === 'battleEntry' — map-native passthrough, see
    // CompanionBattleEntryCard.tsx's module doc.
    const entry = store.battleEntriesById[entity.id];
    battleEntryForVisibility = entry;
    title = entry?.name ?? 'Боевая запись';
    body = entry ? (
      <CompanionBattleEntryCard
        entry={entry}
        data={data}
        sourceLocationTitle={
          entry.sourceLocationStateId ? data.locationStates.find((ls) => ls.id === entry.sourceLocationStateId)?.title : undefined
        }
        currentTimeOfDay={store.getCalendar(entry.timelineId).currentTimeOfDay}
        onClose={onClose}
      />
    ) : (
      <p className="muted">Боевая запись не найдена.</p>
    );
  }

  // Bug-fix pass — "Действия на карте": map-only placement/visibility
  // controls, collapsed by default, rendered below the Companion*Card
  // content rather than mixed into it. Real placement data (not a
  // duplicate/fake panel) — looked up from `data.placements` by entity
  // type+id, same linkage MapWorkspacePage itself uses to match a marker
  // to its entity. `battleEntry` has no MapObjectPlacement record (it is
  // positioned directly via `BattleEntry.position`/`sourceLocationStateId`,
  // see CompanionBattleEntryCard's module doc), so this section is omitted
  // for that type rather than showing an always-empty list.
  const placement =
    entity.type === 'battleEntry'
      ? undefined
      : data.placements.find((p) => p.entityKind === entity.type && p.entityId === entity.id && p.status !== 'archived');

  // Bug-fix pass — bottom "Редактировать" action bar, matching dm-companion's
  // real detail-page btn-row. Editing toggles the existing inline-edit
  // overlay for the types that have one; the others show the same
  // already-established disabled/read-only note instead of faking a save.
  const editAction: (() => void) | undefined =
    entity.type === 'npc'
      ? () => setInlineEditing(true)
      : entity.type === 'tavern'
        ? () => setInlineEditing(true)
        : entity.type === 'shop'
          ? () => setInlineEditing(true)
          : entity.type === 'quest'
            ? () => setInlineEditing(true)
            : entity.type === 'enemy'
              ? () => setInlineEditing(true)
              : entity.type === 'image'
                ? () => setInlineEditing(true)
                : entity.type === 'battleEntry'
                  ? () => setInlineEditing(true)
                  : entity.type === 'location'
                    ? () => setInlineEditing(true)
                    : undefined;
  const editUnsupportedNote = undefined;
  const inlineEntity =
	    entity.type === 'npc'
	      ? data.npcs.find((n) => n.id === entity.id)
	      : entity.type === 'quest'
	        ? data.quests.find((q) => q.id === entity.id)
	        : entity.type === 'enemy'
	          ? data.enemies.find((e) => e.id === entity.id)
	          : entity.type === 'location'
	            ? data.locations.find((l) => l.id === entity.id)
	            : entity.type === 'tavern'
	              ? data.taverns.find((t) => t.id === entity.id)
	              : entity.type === 'shop'
	                ? data.shops.find((s) => s.id === entity.id)
	                : entity.type === 'image'
	                  ? data.images.find((i) => i.id === entity.id)
	                  : entity.type === 'battleEntry'
	                    ? store.battleEntriesById[entity.id]
	                    : undefined;
	  const inlineKind = entity.type === 'npc' ? 'npc' : entity.type === 'quest' ? 'quests' : entity.type === 'enemy' ? 'enemies' : null;

  return (
    <div className="companion-window-overlay" onClick={onClose}>
      <div className="companion-window-panel" onClick={(e) => e.stopPropagation()}>
        <div className="companion-window-header">
          <div>
            {hasBack && (
              <button className="btn-ghost btn-compact" onClick={onBack}>
                ← Назад
              </button>
            )}
            <h2>{title}</h2>
          </div>
          <div className="companion-window-header-actions">
            {/* Header Edit button — moved up from the bottom action bar so
                it's reachable in one click without scrolling past the
                whole card body first, matching the same fix applied to the
                map's object-window-panel header for the marker-click path. */}
            {editAction && (
              <button className="btn-primary btn-compact" onClick={editAction}>
                {inlineEditing ? 'Редактирование' : 'Редактировать'}
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}>
              Закрыть ✕
            </button>
          </div>
        </div>
	        <div className="companion-window-body">
	          {inlineEditing && inlineEntity ? (
	            inlineKind ? (
	              <EntityEditor kind={inlineKind} entity={inlineEntity as Parameters<typeof EntityEditor>[0]['entity']} data={data} onDone={() => setInlineEditing(false)} />
	            ) : (
	              <InlineCompanionEditor entity={entity} value={inlineEntity as DmLocation | DmTavern | DmShop | DmImageItem | BattleEntry} data={data} onDone={() => setInlineEditing(false)} />
	            )
          ) : (
            body
          )}
          {!inlineEditing && questForStatus && (
            <div className="companion-map-actions-body">
              <p className="muted">
                Статус квеста: {QUEST_STATUS_LABELS[effectiveQuestStatus(questForStatus.id, questForStatus.status, store.progress)]}
              </p>
              <div className="actions">
                {QUEST_STATUS_ORDER.filter(
                  (s) => s !== effectiveQuestStatus(questForStatus!.id, questForStatus!.status, store.progress),
                ).map((s) => (
                  <button key={s} className="btn-secondary btn-compact" onClick={() => store.setQuestStatus(questForStatus!.id, s)}>
                    {QUEST_STATUS_ACTION_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {battleEntryForVisibility && (
            <div className="companion-map-actions-body">
              <p className="muted">
                Боевая сцена на карте ·{' '}
                {getVisibilityLabel(
                  battleEntryForVisibility.status === 'hidden' || battleEntryForVisibility.status === 'disabled'
                    ? 'hidden'
                    : battleEntryForVisibility.visibleInPlayerView === true
                      ? 'visible'
                      : 'hidden',
                )}
              </p>
              <div className="actions">
                {battleEntryForVisibility.visibleInPlayerView === true ? (
                  <button onClick={() => store.updateBattleEntry(battleEntryForVisibility!.id, { visibleInPlayerView: false })}>
                    Скрыть от игроков
                  </button>
                ) : (
                  <button onClick={() => store.updateBattleEntry(battleEntryForVisibility!.id, { visibleInPlayerView: true })}>
                    Показать игрокам
                  </button>
                )}
              </div>
            </div>
          )}
          {entity.type !== 'battleEntry' && (
            <details className="companion-map-actions">
              <summary>Действия на карте</summary>
              {placement ? (
                <div className="companion-map-actions-body">
                  <p className="muted">
                    Размещено на карте · {placement.status === 'hidden' ? 'скрыто (ДМ)' : 'активно'} ·{' '}
                    {getVisibilityLabel(getPlacementVisibilityState(placement))}
                  </p>
                  <div className="actions">
                    {placement.status !== 'hidden' ? (
                      <button onClick={() => store.patchPlacement(placement.id, { status: 'hidden' })}>
                        Скрыть маркер (ДМ)
                      </button>
                    ) : (
                      <button onClick={() => store.patchPlacement(placement.id, { status: 'active' })}>
                        Показать маркер (ДМ)
                      </button>
                    )}
                    {placement.visibleInPlayerView ? (
                      <button onClick={() => store.patchPlacement(placement.id, { visibleInPlayerView: false })}>
                        Скрыть от игроков
                      </button>
                    ) : (
                      <button onClick={() => store.patchPlacement(placement.id, { visibleInPlayerView: true })}>
                        Показать игрокам
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="muted">Эта карточка пока не размещена маркером на текущей карте.</p>
              )}
            </details>
          )}
          {/* Edit button itself now lives in the header (see above) for
              one-click reachability. This bar is kept only for entity
              types with no edit mechanism yet, to surface that note. */}
          {!editAction && editUnsupportedNote && (
            <div className="companion-edit-bar">
              <p className="muted companion-readonly-note">{editUnsupportedNote}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function splitLines(value: string): string[] | undefined {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : undefined;
}

function splitTags(value: string): string[] | undefined {
  const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

function InlineCompanionEditor({
  entity,
  value,
  data,
  onDone,
}: {
  entity: EmbeddedCompanionEntity;
  value: DmLocation | DmTavern | DmShop | DmImageItem | BattleEntry;
  data: CampaignData;
  onDone: () => void;
}) {
  if (entity.type === 'location') return <LocationInlineEditor location={value as DmLocation} data={data} onDone={onDone} />;
  if (entity.type === 'tavern') return <TavernInlineEditor tavern={value as DmTavern} data={data} onDone={onDone} />;
  if (entity.type === 'shop') return <ShopInlineEditor shop={value as DmShop} data={data} onDone={onDone} />;
  if (entity.type === 'image') return <ImageInlineEditor image={value as DmImageItem} data={data} onDone={onDone} />;
  if (entity.type === 'battleEntry') return <BattleEntryInlineEditor entry={value as BattleEntry} onDone={onDone} />;
  return <p className="muted">Редактор для этой карточки недоступен.</p>;
}

function LocationInlineEditor({ location, data, onDone }: { location: DmLocation; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: location.name,
    type: location.type,
    region: location.region,
    description: location.description ?? '',
    atmosphere: location.atmosphere ?? '',
    lore: location.lore ?? '',
    playerView: location.playerView ?? '',
    rumors: (location.rumors ?? []).join('\n'),
    dmSecrets: location.dmSecrets ?? '',
    notes: location.notes ?? '',
    tags: (location.tags ?? []).join(', '),
    image: location.images?.[0] ?? '',
  });
  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchLocation(location.id, {
        name: draft.name.trim(),
        type: draft.type.trim(),
        region: draft.region.trim(),
        description: draft.description.trim(),
        atmosphere: draft.atmosphere.trim() || undefined,
        lore: draft.lore.trim() || undefined,
        playerView: draft.playerView.trim() || undefined,
        rumors: splitLines(draft.rumors),
        dmSecrets: draft.dmSecrets.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        tags: splitTags(draft.tags),
        images: draft.image ? [draft.image, ...(location.images ?? []).filter((id) => id !== draft.image)] : (location.images ?? []).slice(1),
      });
      onDone();
    }}>
      <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Тип<input value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} /></label>
      <label>Регион<input value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></label>
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Атмосфера<textarea value={draft.atmosphere} onChange={(e) => setDraft({ ...draft, atmosphere: e.target.value })} /></label>
      <label>Лор<textarea value={draft.lore} onChange={(e) => setDraft({ ...draft, lore: e.target.value })} /></label>
      <label>Что видят игроки<textarea value={draft.playerView} onChange={(e) => setDraft({ ...draft, playerView: e.target.value })} /></label>
      <label>Слухи<textarea value={draft.rumors} onChange={(e) => setDraft({ ...draft, rumors: e.target.value })} /></label>
      <label>Секреты ДМ<textarea value={draft.dmSecrets} onChange={(e) => setDraft({ ...draft, dmSecrets: e.target.value })} /></label>
      <label>Заметки<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <InlineImagePicker value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Теги через запятую<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
      <EditorButtons disabled={!draft.name.trim()} onCancel={onDone} />
    </form>
  );
}

function TavernInlineEditor({ tavern, data, onDone }: { tavern: DmTavern; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: tavern.name,
    location: tavern.location,
    ownerNpcId: tavern.ownerNpcId ?? '',
    description: tavern.description ?? '',
    atmosphere: tavern.atmosphere ?? '',
    services: (tavern.services ?? []).join('\n'),
    rumors: (tavern.rumors ?? []).join('\n'),
    notes: tavern.notes ?? '',
    tags: (tavern.tags ?? []).join(', '),
    image: tavern.imageOverrideId ?? '',
  });
  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchTavern(tavern.id, {
        name: draft.name.trim(),
        location: draft.location,
        ownerNpcId: draft.ownerNpcId || undefined,
        description: draft.description.trim() || undefined,
        atmosphere: draft.atmosphere.trim() || undefined,
        services: splitLines(draft.services),
        rumors: splitLines(draft.rumors),
        notes: draft.notes.trim() || undefined,
        tags: splitTags(draft.tags),
        imageOverrideId: draft.image || undefined,
      });
      onDone();
    }}>
      <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Локация<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>{data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></label>
      <label>Владелец<select value={draft.ownerNpcId} onChange={(e) => setDraft({ ...draft, ownerNpcId: e.target.value })}><option value="">Не задан</option>{data.npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></label>
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Атмосфера<textarea value={draft.atmosphere} onChange={(e) => setDraft({ ...draft, atmosphere: e.target.value })} /></label>
      <label>Услуги по строкам<textarea value={draft.services} onChange={(e) => setDraft({ ...draft, services: e.target.value })} /></label>
      <label>Слухи по строкам<textarea value={draft.rumors} onChange={(e) => setDraft({ ...draft, rumors: e.target.value })} /></label>
      <label>Заметки ДМ<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <InlineImagePicker value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Теги через запятую<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
      <EditorButtons disabled={!draft.name.trim()} onCancel={onDone} />
    </form>
  );
}

function ShopInlineEditor({ shop, data, onDone }: { shop: DmShop; data: CampaignData; onDone: () => void }) {
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
    image: shop.image ?? '',
  });
  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchShop(shop.id, {
        name: draft.name.trim(),
        type: draft.type.trim() || undefined,
        location: draft.location,
        ownerNpcId: draft.ownerNpcId || undefined,
        description: draft.description.trim() || undefined,
        services: splitLines(draft.services),
        relationToPlayers: draft.relationToPlayers.trim() || undefined,
        discounts: draft.discounts.trim() || undefined,
        rumors: splitLines(draft.rumors),
        notes: draft.notes.trim() || undefined,
        tags: splitTags(draft.tags),
        image: draft.image || undefined,
      });
      onDone();
    }}>
      <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Тип<input value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} /></label>
      <label>Локация<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>{data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></label>
      <label>Владелец<select value={draft.ownerNpcId} onChange={(e) => setDraft({ ...draft, ownerNpcId: e.target.value })}><option value="">Не задан</option>{data.npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></label>
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Услуги по строкам<textarea value={draft.services} onChange={(e) => setDraft({ ...draft, services: e.target.value })} /></label>
      <label>Отношение к игрокам<textarea value={draft.relationToPlayers} onChange={(e) => setDraft({ ...draft, relationToPlayers: e.target.value })} /></label>
      <label>Скидки<textarea value={draft.discounts} onChange={(e) => setDraft({ ...draft, discounts: e.target.value })} /></label>
      <label>Слухи по строкам<textarea value={draft.rumors} onChange={(e) => setDraft({ ...draft, rumors: e.target.value })} /></label>
      <label>Заметки ДМ<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <InlineImagePicker value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Теги через запятую<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
      <EditorButtons disabled={!draft.name.trim()} onCancel={onDone} />
    </form>
  );
}

function ImageInlineEditor({ image, data, onDone }: { image: DmImageItem; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    title: image.title,
    safeForPlayers: image.safeForPlayers,
    src: image.src,
  });
  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchImage(image.id, {
        title: draft.title.trim(),
        safeForPlayers: draft.safeForPlayers,
        src: draft.src,
        thumbnailSrc: draft.src,
      });
      onDone();
    }}>
      <label>Название<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <InlineImagePicker value={draft.src} data={data} onChange={(src) => setDraft({ ...draft, src })} />
      <label className="reveal-toggle"><input type="checkbox" checked={draft.safeForPlayers} onChange={(e) => setDraft({ ...draft, safeForPlayers: e.target.checked })} /> Безопасно для игроков</label>
      <EditorButtons disabled={!draft.title.trim()} onCancel={onDone} />
    </form>
  );
}

function BattleEntryInlineEditor({ entry, onDone }: { entry: BattleEntry; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: entry.name,
    status: entry.status,
    visibleInPlayerView: entry.visibleInPlayerView === true,
    playerSafeDescription: entry.playerSafeDescription ?? '',
    dmNotes: entry.dmNotes ?? '',
  });
  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.updateBattleEntry(entry.id, {
        name: draft.name.trim(),
        status: draft.status,
        visibleInPlayerView: draft.visibleInPlayerView,
        playerSafeDescription: draft.playerSafeDescription.trim() || undefined,
        dmNotes: draft.dmNotes.trim() || undefined,
      });
      onDone();
    }}>
      <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Статус<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as BattleEntry['status'] })}>
        <option value="prepared">Подготовлена</option>
        <option value="available">Доступна</option>
        <option value="active">Активна</option>
        <option value="completed">Завершена</option>
        <option value="hidden">Скрыта</option>
        <option value="disabled">Отключена</option>
      </select></label>
      <label className="reveal-toggle"><input type="checkbox" checked={draft.visibleInPlayerView} onChange={(e) => setDraft({ ...draft, visibleInPlayerView: e.target.checked })} /> Видна игрокам</label>
      <label>Описание для игроков<textarea value={draft.playerSafeDescription} onChange={(e) => setDraft({ ...draft, playerSafeDescription: e.target.value })} /></label>
      <label>Заметки ДМ<textarea value={draft.dmNotes} onChange={(e) => setDraft({ ...draft, dmNotes: e.target.value })} /></label>
      <EditorButtons disabled={!draft.name.trim()} onCancel={onDone} />
    </form>
  );
}

function EditorButtons({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) {
  return (
    <div className="entity-editor-actions">
      <button className="btn-primary" type="submit" disabled={disabled}>Сохранить</button>
      <button type="button" onClick={onCancel}>Отмена</button>
    </div>
  );
}
