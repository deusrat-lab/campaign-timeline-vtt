import { useState } from 'react';
import { useUserCampaigns } from '../../state/userCampaignStore';
import type { CampaignEntityType } from '../../types/userCampaign';

const TYPE_LABEL: Record<string, string> = {
  location: 'Локация', npc: 'NPC', quest: 'Квест', enemy: 'Враг', image: 'Картинка', party: 'Игрок', faction: 'Фракция',
};

/**
 * Entity card modal — parity with the main campaign's cards. Shows a user
 * campaign entity (location/NPC/quest/enemy) as a full card with view + inline
 * edit, place-on-map, and delete. Used by both the map workspace and the
 * campaign library pages.
 */
export function CampaignEntityCard({
  campaignId, type, id, onClose, canEdit, onPlaceOnMap, isPlayer = false,
}: {
  campaignId: string;
  type: CampaignEntityType;
  id: string;
  onClose: () => void;
  canEdit: boolean;
  onPlaceOnMap?: () => void;
  /** Player view: hide DM-only fields (DM notes, enemy tactics). */
  isPlayer?: boolean;
}) {
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  const [editing, setEditing] = useState(false);
  if (!data) return null;

  const placement = data.mapPlacements.find((mp) => mp.entityType === type && mp.entityId === id);
  const upd = (patch: Record<string, unknown>) => store.updateEntity(campaignId, type, id, patch);

  const location = type === 'location' ? data.locations.find((l) => l.id === id) : undefined;
  const npc = type === 'npc' ? data.npcs.find((n) => n.id === id) : undefined;
  const quest = type === 'quest' ? data.quests.find((q) => q.id === id) : undefined;
  const enemy = type === 'enemy' ? data.enemies.find((e) => e.id === id) : undefined;
  const player = type === 'party' ? (data.party ?? []).find((p) => p.id === id) : undefined;
  const faction = type === 'faction' ? (data.factions ?? []).find((f) => f.id === id) : undefined;
  const entity = location ?? npc ?? quest ?? enemy ?? player ?? faction;
  if (!entity) { onClose(); return null; }

  const nameField = type === 'npc' || type === 'party' || type === 'faction';
  const title = location?.title ?? npc?.name ?? quest?.title ?? enemy?.title ?? player?.name ?? faction?.name ?? '';
  const ro = !editing || !canEdit;

  return (
    <div className="ucw-modal-overlay" onClick={onClose}>
      <div className="ucw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ucw-modal-head">
          <div>
            <div className="ucw-modal-type">{TYPE_LABEL[type]}{placement ? ' · на карте' : ''}</div>
            {ro ? <h2>{title}</h2> : (
              <input
                className="ucw-search" style={{ fontSize: '1.2rem', minWidth: 260 }}
                value={title}
                onChange={(e) => upd(nameField ? { name: e.target.value } : { title: e.target.value })}
              />
            )}
          </div>
          <button className="ucw-modal-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

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

        {canEdit && (
          <div className="ucw-card-actions">
            <button className="atlas-btn small" onClick={() => setEditing((v) => !v)}>{editing ? 'Готово' : 'Редактировать'}</button>
            <button
              className="atlas-btn ghost small"
              title={store.isRevealed(campaignId, id) ? 'Игроки видят эту карточку в библиотеке' : 'Скрыто от игроков'}
              onClick={() => store.toggleReveal(campaignId, id)}
            >
              {store.isRevealed(campaignId, id) ? '👁 Показано игрокам' : '🚫 Показать игрокам'}
            </button>
            {onPlaceOnMap && !placement && (
              <button className="atlas-btn ghost small" onClick={() => { onPlaceOnMap(); onClose(); }}>Поставить на карту</button>
            )}
            {placement && (
              <>
                <button className="atlas-btn ghost small" onClick={() => store.updatePlacement(campaignId, placement.id, { visibleToPlayers: !placement.visibleToPlayers })}>
                  {placement.visibleToPlayers ? '👁 Видно игрокам' : '🚫 Скрыто от игроков'}
                </button>
                <button className="atlas-btn ghost small" onClick={() => store.removePlacement(campaignId, placement.id)}>Снять с карты</button>
              </>
            )}
            <button className="atlas-btn danger small" onClick={() => { store.deleteEntity(campaignId, type, id); onClose(); }}>Удалить</button>
          </div>
        )}
      </div>
    </div>
  );
}
