import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import { effectiveQuestStatus } from '../data/selectors';
import type { QuestStatus } from '../types';

const STATUSES: QuestStatus[] = ['active', 'completed', 'failed', 'hidden'];
const STATUS_LABELS: Record<QuestStatus, string> = {
  active: 'Активные',
  completed: 'Завершённые',
  failed: 'Провалены',
  hidden: 'Скрытые',
};

export function QuestsPage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();

  if (loading) return <p>Загрузка…</p>;
  if (error || !data) return <p>Ошибка загрузки: {error}</p>;

  const timeline = data.timelines.find((t) => t.id === store.currentTimelineId) ?? data.timelines[0];
  const isPlayerView = store.mode === 'player-view';
  const questsForTimeline = data.quests.filter((q) => (q.arcId ?? 'arc-1') === timeline.arcId);

  const grouped = STATUSES.map((status) => ({
    status,
    quests: questsForTimeline.filter((q) => effectiveQuestStatus(q.id, q.status, store.progress) === status),
  })).filter((g) => g.status !== 'hidden' || !isPlayerView);

  function quickAction(questId: string, status: QuestStatus) {
    store.setQuestStatus(questId, status);
  }

  return (
    <div className="page">
      <h1>Квесты — {timeline.title}</h1>
      {!isPlayerView && timeline.arcId === 'arc-1' && (
        <div className="hint-banner">
          ДМ: отметьте здесь 2 уже выполненных мини-квеста Арки 1.
        </div>
      )}
      {grouped.map((g) => (
        <section className="card" key={g.status}>
          <h2>
            {STATUS_LABELS[g.status]} ({g.quests.length})
          </h2>
          <ul className="quest-list">
            {g.quests.map((q) => {
              const current = effectiveQuestStatus(q.id, q.status, store.progress);
              return (
                <li key={q.id} className="quest-row">
                  <span>{q.title}</span>
                  <div className="actions">
                    {!isPlayerView ? (
                      <>
                        {current !== 'active' && (
                          <button onClick={() => quickAction(q.id, 'active')}>Вернуть в доступные</button>
                        )}
                        {current !== 'completed' && (
                          <button onClick={() => quickAction(q.id, 'completed')}>Завершить</button>
                        )}
                        {current !== 'failed' && <button onClick={() => quickAction(q.id, 'failed')}>Провалить</button>}
                        {current !== 'hidden' && <button onClick={() => quickAction(q.id, 'hidden')}>Скрыть</button>}
                        <select value={current} onChange={(e) => store.setQuestStatus(q.id, e.target.value as QuestStatus)}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="status-badge">{STATUS_LABELS[current]}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
