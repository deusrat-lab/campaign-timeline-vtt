import { useMemo, useState } from 'react';
import { useUserCampaigns } from '../../state/userCampaignStore';
import type { CampaignEntityType } from '../../types/userCampaign';
import { RichEntityDetail } from '../../shared/entity/RichEntityDetail';
import { buildDetail, type LibraryKind } from '../../shared/entity/userCampaignEntityVM';

const TYPE_LABEL: Record<string, string> = {
  location: 'Локация', npc: 'NPC', quest: 'Квест', enemy: 'Враг', image: 'Картинка', party: 'Игрок', faction: 'Фракция',
};

const ENTITY_TO_LIBKIND: Partial<Record<CampaignEntityType, LibraryKind>> = {
  location: 'locations',
  npc: 'npc',
  quest: 'quests',
  enemy: 'enemies',
  party: 'players',
  faction: 'factions',
};

const LIBKIND_TO_ENTITY: Record<LibraryKind, CampaignEntityType> = {
  locations: 'location',
  npc: 'npc',
  quests: 'quest',
  enemies: 'enemy',
  players: 'party',
  factions: 'faction',
};

/**
 * Entity card modal — parity with the main campaign's cards. Shows a user
 * campaign entity (location/NPC/quest/enemy) as a full card with view + inline
 * edit, place-on-map, and delete. Used by both the map workspace and the
 * campaign library pages.
 */
export function CampaignEntityCard({
  campaignId, type, id, onClose, canEdit, onPlaceOnMap, isPlayer = false, allowClose = true,
}: {
  campaignId: string;
  type: CampaignEntityType;
  id: string;
  onClose: () => void;
  canEdit: boolean;
  onPlaceOnMap?: (type: CampaignEntityType, id: string) => void;
  /** Player view: hide DM-only fields (DM notes, enemy tactics). */
  isPlayer?: boolean;
  /** Presentation overlay in player view is controlled by the DM, not players. */
  allowClose?: boolean;
}) {
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  const runtime = store.getRuntime(campaignId);
  const originKey = `${type}:${id}`;
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [stackState, setStackState] = useState<{ originKey: string; items: Array<{ type: CampaignEntityType; id: string }> } | null>(null);
  const stack = useMemo(
    () => (stackState?.originKey === originKey ? stackState.items : [{ type, id }]),
    [id, originKey, stackState, type],
  );
  const current = stack[stack.length - 1] ?? { type, id };
  const currentKey = `${current.type}:${current.id}`;
  const presented = runtime.presentedCard;
  const presenting = presented?.entityType === current.type && presented?.entityId === current.id;
  const clearPresentingCurrent = () => {
    if (presenting) store.updateRuntime(campaignId, (prev) => ({ ...prev, presentedCard: null }));
  };
  const editing = editingFor === currentKey && canEdit;
  const goBack = () => {
    setEditingFor(null);
    setStackState({ originKey, items: stack.slice(0, -1) });
  };
  const closeTop = () => {
    if (!allowClose) return;
    clearPresentingCurrent();
    if (stack.length > 1) {
      goBack();
    } else {
      onClose();
    }
  };

  const currentKind = ENTITY_TO_LIBKIND[current.type];
  const detailVm = useMemo(() => (data && currentKind) ? buildDetail(currentKind, current.id, data, {
    imageUrl: (imageId?: string) => (imageId ? data.images.find((im) => im.id === imageId)?.src : undefined),
    onOpen: (kind, nextId) => {
      setEditingFor(null);
      setStackState({ originKey, items: [...stack, { type: LIBKIND_TO_ENTITY[kind], id: nextId }] });
    },
    isPlaced: (entityType, entityId) => data.mapPlacements.some((mp) => mp.entityType === entityType && mp.entityId === entityId),
    isRevealed: (entityId) => store.isRevealed(campaignId, entityId),
    match: () => true,
    isPlayer,
  }) : null, [campaignId, current.id, currentKind, data, isPlayer, originKey, stack, store]);

  if (!data) return null;

  const placement = data.mapPlacements.find((mp) => mp.entityType === current.type && mp.entityId === current.id);
  const revealed = store.isRevealed(campaignId, current.id);
  const upd = (patch: Record<string, unknown>) => store.updateEntity(campaignId, current.type, current.id, patch);

  const location = current.type === 'location' ? data.locations.find((l) => l.id === current.id) : undefined;
  const npc = current.type === 'npc' ? data.npcs.find((n) => n.id === current.id) : undefined;
  const quest = current.type === 'quest' ? data.quests.find((q) => q.id === current.id) : undefined;
  const enemy = current.type === 'enemy' ? data.enemies.find((e) => e.id === current.id) : undefined;
  const player = current.type === 'party' ? (data.party ?? []).find((p) => p.id === current.id) : undefined;
  const faction = current.type === 'faction' ? (data.factions ?? []).find((f) => f.id === current.id) : undefined;
  const entity = location ?? npc ?? quest ?? enemy ?? player ?? faction;
  if (!entity) return null;

  const nameField = current.type === 'npc' || current.type === 'party' || current.type === 'faction';
  const title = location?.title ?? npc?.name ?? quest?.title ?? enemy?.title ?? player?.name ?? faction?.name ?? '';
  const ro = !editing || !canEdit;

  return (
    <div className={`ucw-modal-overlay${!allowClose ? ' presentation' : ''}`} onClick={allowClose ? closeTop : undefined}>
      <div className="ucw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ucw-modal-head">
          <div>
            <div className="ucw-modal-type">{TYPE_LABEL[current.type]}{placement ? ' · на карте' : ''}</div>
            {ro ? <h2>{title}</h2> : (
              <input
                className="ucw-search" style={{ fontSize: '1.2rem', minWidth: 260 }}
                value={title}
                onChange={(e) => upd(nameField ? { name: e.target.value } : { title: e.target.value })}
              />
            )}
          </div>
          {allowClose ? (
            <button className="ucw-modal-close" onClick={closeTop} aria-label={stack.length > 1 ? 'Закрыть верхнюю карточку' : 'Закрыть'}>✕</button>
          ) : stack.length > 1 ? (
            <button className="atlas-btn ghost small" onClick={goBack}>← Назад</button>
          ) : (
            <span className="ucw-chip">Показывает ДМ</span>
          )}
        </div>

        {!editing && detailVm ? (
          <RichEntityDetail
            vm={detailVm}
            isPlayer={isPlayer}
            actions={{
              onEdit: canEdit ? () => setEditingFor(currentKey) : undefined,
              onPlace: canEdit && onPlaceOnMap && !placement ? () => { onPlaceOnMap(current.type, current.id); onClose(); } : undefined,
              placed: !!placement,
              onPresent: canEdit ? () => store.updateRuntime(campaignId, (prev) => ({
                ...prev,
                presentedCard: presenting ? null : { entityType: current.type, entityId: current.id },
              })) : undefined,
              presenting,
              onToggleReveal: canEdit ? () => store.toggleReveal(campaignId, current.id) : undefined,
              revealed,
              onDelete: canEdit ? () => { store.deleteEntity(campaignId, current.type, current.id); onClose(); } : undefined,
            }}
          />
        ) : (
        <div className="ucw-card" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          {npc && (
            <>
              <label>Роль</label>
              {ro ? <p>{npc.role || '—'}</p> : <input value={npc.role ?? ''} onChange={(e) => upd({ role: e.target.value })} />}
              <label>Локация</label>
              {ro ? <p>{data.locations.find((l) => l.id === npc.locationId)?.title ?? '—'}</p> : (
                <select value={npc.locationId ?? ''} onChange={(e) => upd({ locationId: e.target.value || undefined })}>
                  <option value="">— не привязан —</option>
                  {data.locations.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              )}
            </>
          )}

          {quest && (
            <>
              <label>Статус</label>
              {ro ? <p>{quest.status}</p> : (
                <select value={quest.status} onChange={(e) => upd({ status: e.target.value })}>
                  {['notStarted', 'active', 'completed', 'failed', 'hidden'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </>
          )}

          {enemy && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label>AC</label>{ro ? <p>{enemy.ac ?? '—'}</p> : <input type="number" value={enemy.ac ?? ''} onChange={(e) => upd({ ac: Number(e.target.value) })} />}</div>
                <div style={{ flex: 1 }}><label>HP</label>{ro ? <p>{enemy.hp ?? '—'}</p> : <input type="number" value={enemy.hp ?? ''} onChange={(e) => upd({ hp: Number(e.target.value) })} />}</div>
              </div>
              {!isPlayer && (
                <>
                  <label>Тактика / особенности</label>
                  {ro ? <p style={{ whiteSpace: 'pre-wrap' }}>{enemy.tactics || '—'}</p> : <textarea value={enemy.tactics ?? ''} onChange={(e) => upd({ tactics: e.target.value })} />}
                </>
              )}
            </>
          )}

          {player && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}><label>Игрок</label>{ro ? <p>{player.playerName || '—'}</p> : <input value={player.playerName ?? ''} onChange={(e) => upd({ playerName: e.target.value })} />}</div>
                <div style={{ flex: 2 }}><label>Класс</label>{ro ? <p>{player.class || '—'}</p> : <input value={player.class ?? ''} onChange={(e) => upd({ class: e.target.value })} />}</div>
                <div style={{ flex: 1 }}><label>Уровень</label>{ro ? <p>{player.level ?? '—'}</p> : <input type="number" value={player.level ?? ''} onChange={(e) => upd({ level: Number(e.target.value) })} />}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label>AC</label>{ro ? <p>{player.ac ?? '—'}</p> : <input type="number" value={player.ac ?? ''} onChange={(e) => upd({ ac: Number(e.target.value) })} />}</div>
                <div style={{ flex: 1 }}><label>HP</label>{ro ? <p>{player.hp ?? '—'}</p> : <input type="number" value={player.hp ?? ''} onChange={(e) => upd({ hp: Number(e.target.value) })} />}</div>
                <div style={{ flex: 1 }}><label>Макс HP</label>{ro ? <p>{player.maxHp ?? '—'}</p> : <input type="number" value={player.maxHp ?? ''} onChange={(e) => upd({ maxHp: Number(e.target.value) })} />}</div>
              </div>
            </>
          )}

          {faction && (
            <>
              <label>Роль</label>
              {ro ? <p>{faction.role || '—'}</p> : <input value={faction.role ?? ''} onChange={(e) => upd({ role: e.target.value })} />}
              <label>Отношение</label>
              {ro ? <p>{faction.attitude ?? '—'}</p> : (
                <select value={faction.attitude ?? 'neutral'} onChange={(e) => upd({ attitude: e.target.value })}>
                  {['ally', 'neutral', 'enemy', 'unknown'].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </>
          )}

          <label>Описание</label>
          {ro ? <p style={{ whiteSpace: 'pre-wrap' }}>{entity.description || '—'}</p> : <textarea value={entity.description ?? ''} onChange={(e) => upd({ description: e.target.value })} />}

          {!isPlayer && (
            <>
              <label>DM-заметки (скрыто от игроков)</label>
              {ro
                ? <p style={{ color: 'var(--gold-soft)', whiteSpace: 'pre-wrap' }}>{(entity as { dmNotes?: string }).dmNotes || '—'}</p>
                : <textarea value={(entity as { dmNotes?: string }).dmNotes ?? ''} onChange={(e) => upd({ dmNotes: e.target.value })} />}
            </>
          )}
        </div>
        )}

        {canEdit && editing && (
          <div className="ucw-card-actions">
            <button className="atlas-btn small" onClick={() => setEditingFor(editing ? null : currentKey)}>{editing ? 'Готово' : 'Редактировать'}</button>
            <button
              className="atlas-btn ghost small"
              title={revealed ? 'Игроки видят эту карточку в библиотеке' : 'Скрыто от игроков'}
              onClick={() => store.toggleReveal(campaignId, current.id)}
            >
              {revealed ? '👁 Показано игрокам' : '🚫 Показать игрокам'}
            </button>
            {onPlaceOnMap && !placement && (
              <button className="atlas-btn ghost small" onClick={() => { onPlaceOnMap(current.type, current.id); onClose(); }}>Поставить на карту</button>
            )}
            {placement && (
              <>
                <button className="atlas-btn ghost small" onClick={() => store.updatePlacement(campaignId, placement.id, { visibleToPlayers: !placement.visibleToPlayers })}>
                  {placement.visibleToPlayers ? '👁 Видно игрокам' : '🚫 Скрыто от игроков'}
                </button>
                <button className="atlas-btn ghost small" onClick={() => store.removePlacement(campaignId, placement.id)}>Снять с карты</button>
              </>
            )}
            <button className="atlas-btn danger small" onClick={() => { store.deleteEntity(campaignId, current.type, current.id); onClose(); }}>Удалить</button>
          </div>
        )}
      </div>
    </div>
  );
}
