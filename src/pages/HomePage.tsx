import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import { effectiveQuestStatus, getLocationState, getRootLocationStates, isLocationVisibleToPlayers } from '../data/selectors';
import { buildPrefillReport } from '../data/generatedPrefillReport';
import type { LocationState } from '../types';

export function HomePage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const navigate = useNavigate();
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [showTimelineEdit, setShowTimelineEdit] = useState(false);
  const [showPrefillReport, setShowPrefillReport] = useState(false);

  if (loading) return <p>Загрузка данных кампании…</p>;
  if (error || !data) return <p>Ошибка загрузки: {error}</p>;

  const timeline = data.timelines.find((t) => t.id === store.currentTimelineId) ?? data.timelines[0];
  const isEditMode = store.mode === 'dm-edit';
  const isPlayerView = store.mode === 'player-view';
  const currentLocation = store.party.currentLocationStateId
    ? getLocationState(data, store.party.currentLocationStateId)
    : undefined;

  const activeQuests = data.quests.filter(
    (q) => q.arcId === timeline.arcId && effectiveQuestStatus(q.id, q.status, store.progress) === 'active',
  );

  const rootLocations = getRootLocationStates(data, store.currentTimelineId).filter(
    (ls) => !isPlayerView || isLocationVisibleToPlayers(ls, store.progress),
  );

  const prefillReport = !isPlayerView ? buildPrefillReport(data) : null;

  function renderTree(ls: LocationState, depth: number) {
    const children = data!.locationStates.filter((c) => ls.childLocationStateIds.includes(c.id));
    const visibleChildren = isPlayerView ? children.filter((c) => isLocationVisibleToPlayers(c, store.progress)) : children;
    return (
      <li key={ls.id} style={{ marginLeft: depth * 16 }}>
        <Link to={`/location/${ls.id}`}>{ls.title}</Link>
        {visibleChildren.length > 0 && <ul>{visibleChildren.map((c) => renderTree(c, depth + 1))}</ul>}
      </li>
    );
  }

  function createLocation() {
    if (!newName.trim()) return;
    const locId = `custom-${Date.now()}`;
    const id = `${locId}__${store.currentTimelineId}`;
    store.addLocationState({
      id,
      locationId: locId,
      timelineId: store.currentTimelineId,
      title: newName.trim(),
      type: newType.trim() || undefined,
      publicDescription: '',
      status: 'known',
      parentLocationStateId: newParentId || undefined,
      childLocationStateIds: [],
      npcIds: [],
      questIds: [],
      enemyIds: [],
      imageIds: [],
      isCustom: true,
    });
    if (newParentId) {
      const parent = data!.locationStates.find((s) => s.id === newParentId);
      if (parent) {
        store.patchLocationState(parent.id, { childLocationStateIds: [...parent.childLocationStateIds, id] });
      }
    }
    setShowNewLocation(false);
    setNewName('');
    setNewType('');
    setNewParentId('');
    navigate(`/location/${id}`);
  }

  return (
    <div className="page">
      <h1>{timeline.title}</h1>
      {timeline.description && <p>{timeline.description}</p>}

      <section className="card">
        <h2>Текущее положение партии</h2>
        {currentLocation ? (
          <p>
            Партия находится в: <Link to={`/location/${currentLocation.id}`}>{currentLocation.title}</Link>
          </p>
        ) : (
          <p>Положение партии не задано. Выберите локацию на карте.</p>
        )}
      </section>

      <section className="card">
        <h2>Быстрые ссылки</h2>
        <ul className="quick-links">
          <li>
            <Link to="/map">Карта мира</Link>
          </li>
          <li>
            <Link to="/quests">Активные квесты ({activeQuests.length})</Link>
          </li>
          {currentLocation && (
            <li>
              <Link to={`/location/${currentLocation.id}`}>NPC рядом ({currentLocation.npcIds.length})</Link>
            </li>
          )}
        </ul>
      </section>

      <section className="card">
        <div className="section-title-row">
          <h2>Локации</h2>
          {isEditMode && <button onClick={() => setShowNewLocation((v) => !v)}>+ Новая локация</button>}
        </div>
        {showNewLocation && (
          <div className="form-grid dm-only">
            <div className="form-row">
              <label>Название</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Тип</label>
              <input type="text" value={newType} onChange={(e) => setNewType(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Родительская локация</label>
              <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
                <option value="">— нет (корневая) —</option>
                {data.locationStates
                  .filter((s) => s.timelineId === store.currentTimelineId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="actions">
              <button onClick={createLocation}>Создать</button>
              <button onClick={() => setShowNewLocation(false)}>Отмена</button>
            </div>
          </div>
        )}
        <ul>{rootLocations.map((ls) => renderTree(ls, 0))}</ul>
      </section>

      {!isPlayerView && prefillReport && (
        <section className="card dm-only">
          <div className="section-title-row">
            <h2>Отчёт о предзаполнении</h2>
            <button onClick={() => setShowPrefillReport((v) => !v)}>{showPrefillReport ? 'Скрыть' : 'Показать'}</button>
          </div>
          {showPrefillReport && (
            <div>
              <p>Всего локаций импортировано из dm-companion: {prefillReport.totalLocationsImported}</p>
              <h3>LocationState по таймлайнам</h3>
              <ul>
                {prefillReport.locationStatesPerTimeline.map((t) => (
                  <li key={t.timelineId}>
                    {t.timelineTitle}: {t.count}
                  </li>
                ))}
              </ul>
              <p>NPC привязано: {prefillReport.npcsLinked}</p>
              <p>Квестов привязано: {prefillReport.questsLinked}</p>
              <p>Врагов привязано: {prefillReport.enemiesLinked}</p>
              <p>Изображений привязано: {prefillReport.imagesLinked}</p>
              <h3>Связи боевых карт по уверенности</h3>
              <ul>
                <li>Exact: {prefillReport.battleMapLinksByConfidence.exact}</li>
                <li>Likely: {prefillReport.battleMapLinksByConfidence.likely}</li>
                <li>Manual required: {prefillReport.battleMapLinksByConfidence.manual_required}</li>
              </ul>
              <h3>Хотспоты</h3>
              <ul>
                <li>Нужна проверка координат: {prefillReport.hotspotsByCoordinateReview.needsReview}</li>
                <li>Координаты подтверждены: {prefillReport.hotspotsByCoordinateReview.ok}</li>
              </ul>
              <h3>Связи иерархии по источнику</h3>
              <ul>
                <li>Inferred: {prefillReport.hierarchyLinksBySource.inferred}</li>
                <li>Sourced: {prefillReport.hierarchyLinksBySource.sourced}</li>
              </ul>
              <h3>Требует ручной проверки</h3>
              <ul>
                {prefillReport.needsManualReview.battleMapIds.map((id) => (
                  <li key={`bm-${id}`}>Боевая карта (manual_required): {id}</li>
                ))}
                {prefillReport.needsManualReview.hotspotLabels.map((label, i) => (
                  <li key={`hs-${label}-${i}`}>Хотспот (нужны координаты): {label}</li>
                ))}
                {prefillReport.needsManualReview.hierarchyLocationIds.map((id) => (
                  <li key={`hi-${id}`}>Иерархия (inferred, не sourced): {id}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {isEditMode && (
        <section className="card dm-only">
          <div className="section-title-row">
            <h2>Редактирование арки</h2>
            <button onClick={() => setShowTimelineEdit((v) => !v)}>{showTimelineEdit ? 'Скрыть' : 'Показать'}</button>
          </div>
          {showTimelineEdit && (
            <div className="form-grid">
              <div className="form-row">
                <label>Название</label>
                <input
                  type="text"
                  value={timeline.title}
                  onChange={(e) => store.patchTimeline(timeline.id, { title: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>Описание</label>
                <textarea
                  value={timeline.description ?? ''}
                  onChange={(e) => store.patchTimeline(timeline.id, { description: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={timeline.visibleToPlayers ?? false}
                    onChange={(e) => store.patchTimeline(timeline.id, { visibleToPlayers: e.target.checked })}
                  />
                  Видна игрокам
                </label>
              </div>
              <div className="form-row">
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={timeline.isCurrent ?? false}
                    onChange={(e) => store.patchTimeline(timeline.id, { isCurrent: e.target.checked })}
                  />
                  Текущая (по сюжету)
                </label>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
