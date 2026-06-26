import type { CampaignData } from '../../data/loadCampaignData';
import { useCampaignStore } from '../../state/campaignStore';
import { CompanionLocationCard } from './CompanionLocationCard';
import { CompanionTavernCard } from './CompanionTavernCard';
import { CompanionShopCard } from './CompanionShopCard';
import { CompanionNpcCard } from './CompanionNpcCard';
import { CompanionQuestCard } from './CompanionQuestCard';
import { CompanionEnemyCard } from './CompanionEnemyCard';
import { CompanionImageCard } from './CompanionImageCard';
import { CompanionBattleEntryCard } from './CompanionBattleEntryCard';

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

export function EmbeddedCompanionWindow({
  entity,
  hasBack,
  onBack,
  onClose,
  onOpen,
  data,
  npcs,
  quests,
  onEditNpc,
  onEditTavern,
  onEditShop,
  onEditImage,
  onEditBattleEntry,
}: {
  entity: EmbeddedCompanionEntity;
  hasBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onOpen: (entity: EmbeddedCompanionEntity) => void;
  data: CampaignData;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  /** Bug-fix pass — "Редактировать" bottom action bar (see dm-companion's
   * real ShopDetailPage.tsx/NpcDetailPage.tsx btn-row: Редактировать /
   * Перенести в архив / Удалить). Only npc/tavern/shop/image/battleEntry
   * have a real override-patch edit mechanism in this app today
   * (MapWorkspacePage's `open*Editor` functions) — location/quest/enemy
   * genuinely have none yet (same pre-existing limitation already
   * documented in CompanionQuestCard's/CompanionEnemyCard's own
   * "Редактирование ... будет добавлено отдельным этапом" notes), so those
   * three omit this prop and the bar shows that same disabled message
   * instead of a non-functional button. */
  onEditNpc?: (npcId: string) => void;
  onEditTavern?: (tavernId: string) => void;
  onEditShop?: (shopId: string) => void;
  onEditImage?: (imageId: string) => void;
  onEditBattleEntry?: (battleEntryId: string) => void;
}) {
  const store = useCampaignStore();
  const openNpc = (id: string) => onOpen({ type: 'npc', id });
  const openQuest = (id: string) => onOpen({ type: 'quest', id });
  const openShop = (id: string) => onOpen({ type: 'shop', id });
  const openLocation = (id: string) => onOpen({ type: 'location', id });
  const openEnemy = (id: string) => onOpen({ type: 'enemy', id });

  let title: string;
  let body: React.ReactNode;

  if (entity.type === 'location') {
    const loc = data.locations.find((l) => l.id === entity.id);
    title = loc?.name ?? 'Локация';
    // Bug-fix pass (audit: "Рыночная площадь") — dm-companion's real
    // LocationDetailPage also shows "Магазины здесь" (shops with
    // `shop.location === loc.id`) and "Связанные враги"
    // (`enemy.locationIds.includes(loc.id)`); both are reverse lookups,
    // same as it does, not stored directly on DmLocation.
    const shopsHere = loc ? data.shops.filter((s) => s.location === loc.id) : [];
    const enemiesHere = loc ? data.enemies.filter((e) => e.locationIds?.includes(loc.id)) : [];
    body = loc ? (
      <CompanionLocationCard
        loc={loc}
        npcs={npcs}
        quests={quests}
        shops={shopsHere}
        enemies={enemiesHere}
        images={data.images}
        onOpenNpc={openNpc}
        onOpenQuest={openQuest}
        onOpenShop={openShop}
        onOpenEnemy={openEnemy}
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
        npcs={npcs}
        quests={quests}
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
        npcs={npcs}
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
      <CompanionNpcCard npc={npc} locationName={loc?.name} shop={shop} quests={quests} images={data.images} onOpenQuest={openQuest} onOpenShop={openShop} />
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
        npcs={npcs}
        enemies={data.enemies}
        images={data.images}
        locationName={loc?.name}
        onOpenNpc={openNpc}
        onOpenLocation={openLocation}
        onOpenEnemy={openEnemy}
      />
    ) : (
      <p className="muted">Квест не найден.</p>
    );
  } else if (entity.type === 'enemy') {
    const enemy = data.enemies.find((e) => e.id === entity.id);
    title = enemy?.name ?? 'Враг';
    body = enemy ? (
      <CompanionEnemyCard enemy={enemy} locations={data.locations} quests={quests} images={data.images} onOpenLocation={openLocation} onOpenQuest={openQuest} />
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
      const questNames = (image.linkedQuestIds ?? []).map((id) => data.quests.find((q) => q.id === id)?.title ?? id);
      body = (
        <CompanionImageCard
          image={image}
          locationName={loc?.name}
          npcName={npc?.name}
          enemyName={enemy?.name}
          questNames={questNames}
          onOpenLocation={loc ? () => openLocation(loc.id) : undefined}
          onOpenNpc={npc ? () => openNpc(npc.id) : undefined}
          onOpenEnemy={enemy ? () => openEnemy(enemy.id) : undefined}
        />
      );
    }
  } else {
    // entity.type === 'battleEntry' — map-native passthrough, see
    // CompanionBattleEntryCard.tsx's module doc.
    const entry = store.battleEntriesById[entity.id];
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
    entity.type === 'npc' && onEditNpc
      ? () => onEditNpc(entity.id)
      : entity.type === 'tavern' && onEditTavern
        ? () => onEditTavern(entity.id)
        : entity.type === 'shop' && onEditShop
          ? () => onEditShop(entity.id)
          : entity.type === 'image' && onEditImage
            ? () => onEditImage(entity.id)
            : entity.type === 'battleEntry' && onEditBattleEntry
              ? () => onEditBattleEntry(entity.id)
              : undefined;
  const editUnsupportedNote =
    entity.type === 'location' || entity.type === 'quest' || entity.type === 'enemy'
      ? 'Редактирование исходной карточки будет добавлено отдельным этапом.'
      : undefined;

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
          <button className="btn-ghost" onClick={onClose}>
            Закрыть ✕
          </button>
        </div>
        <div className="companion-window-body">
          {body}
          {entity.type !== 'battleEntry' && (
            <details className="companion-map-actions">
              <summary>Действия на карте</summary>
              {placement ? (
                <div className="companion-map-actions-body">
                  <p className="muted">
                    Размещено на карте · {placement.status === 'hidden' ? 'скрыто (ДМ)' : 'активно'} ·{' '}
                    {placement.visibleInPlayerView ? 'видно игрокам' : 'скрыто от игроков'}
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
          {/* Bug-fix pass — bottom action bar, matching dm-companion's real
              detail-page btn-row (Редактировать / Перенести в архив /
              Удалить). "Перенести в архив"/"Удалить" are not added here:
              this app has no archive/delete flow for library source
              records (only for placed map markers, already covered by
              "Действия на карте" above) — adding fake destructive buttons
              would be worse than omitting them. */}
          <div className="companion-edit-bar">
            {editAction ? (
              <button className="btn-secondary btn-compact" onClick={editAction}>
                Редактировать
              </button>
            ) : (
              <p className="muted companion-readonly-note">{editUnsupportedNote}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
