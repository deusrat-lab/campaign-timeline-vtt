import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { getCampaignById } from '../../data/campaignModules';
import { getModuleById } from '../../data/adventureModules';
import { getRegionById } from '../../data/worldRegions';
import { getAtlasMapById } from '../../data/worldAtlasMaps';
import { useCampaignRuntime } from '../../state/campaignRuntimeStore';
import {
  CAMPAIGN_CANON_OUTCOME_LABELS,
  DEFAULT_CAMPAIGN_CANON_OUTCOME,
  type CampaignCanonOutcomePolicy,
} from '../../types/campaign';

function CompleteForm({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  const runtime = useCampaignRuntime();
  const [policy, setPolicy] = useState<CampaignCanonOutcomePolicy>(DEFAULT_CAMPAIGN_CANON_OUTCOME);
  const [summary, setSummary] = useState('');
  return (
    <div className="atlas-panel" style={{ marginTop: 12 }}>
      <h3 style={{ marginBottom: 10 }}>Как итог влияет на мир?</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {(Object.keys(CAMPAIGN_CANON_OUTCOME_LABELS) as CampaignCanonOutcomePolicy[]).map((p) => (
          <label key={p} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.92rem' }}>
            <input type="radio" name="canon-policy" checked={policy === p} onChange={() => setPolicy(p)} />
            {CAMPAIGN_CANON_OUTCOME_LABELS[p]}
            {p === DEFAULT_CAMPAIGN_CANON_OUTCOME && <span className="atlas-tag">по умолчанию</span>}
          </label>
        ))}
      </div>
      <textarea className="atlas-input" style={{ width: '100%', minHeight: 70, marginBottom: 12 }} placeholder="Краткий итог…" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <p style={{ fontSize: '0.82rem', color: 'var(--fg-faint)', marginBottom: 12 }}>
        По умолчанию итог не влияет на основную кампанию (Арку 1 и Арку 2). Их данные не изменяются.
      </p>
      <button className="atlas-btn" onClick={() => { runtime.completeCampaign(campaignId, { selectedPolicy: policy, summary: summary.trim() }); onDone(); }}>
        Завершить
      </button>
    </div>
  );
}

export function CampaignSessionPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const runtime = useCampaignRuntime();
  const [note, setNote] = useState('');
  const [newCombatant, setNewCombatant] = useState('');
  const [showComplete, setShowComplete] = useState(false);

  const campaign = campaignId ? getCampaignById(campaignId) : undefined;
  if (!campaign || !campaignId || campaign.protected) {
    return (
      <div className="atlas-layer">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Сессия недоступна для этой кампании.</p>
      </div>
    );
  }

  const state = runtime.getRuntime(campaignId);
  const adv = campaign.adventureModuleId ? getModuleById(campaign.adventureModuleId) : undefined;
  const scenes = adv ? [...adv.scenes].sort((a, b) => a.order - b.order) : [];
  const activeScene = scenes.find((s) => s.id === state.activeSceneId) ?? scenes[0];
  const activeMap = state.activeMapId ? getAtlasMapById(state.activeMapId) : (campaign.mapIds[0] ? getAtlasMapById(campaign.mapIds[0]) : undefined);

  return (
    <div className="atlas-layer">
      <button className="atlas-back-link" onClick={() => navigate(`/campaigns/${campaignId}`)}>← К дашборду кампании</button>

      <div className="atlas-header">
        <div>
          <h1>Сессия: {campaign.titleRu ?? campaign.title}</h1>
          <div className="atlas-badges">
            <span className="atlas-badge">{campaign.canonPolicy}</span>
            <span className={`atlas-badge status-${state.status}`}>{state.status}</span>
          </div>
        </div>
        {state.status !== 'completed' && (
          <button className="atlas-btn danger" onClick={() => setShowComplete((v) => !v)}>Завершить кампанию/ваншот</button>
        )}
      </div>

      {state.status === 'completed' && state.canonOutcome && (
        <div className="atlas-panel" style={{ borderColor: 'var(--purple)' }}>
          <strong>Завершено.</strong> Итог: {CAMPAIGN_CANON_OUTCOME_LABELS[state.canonOutcome.selectedPolicy]}.
          {state.canonOutcome.summary && <div style={{ marginTop: 6, color: 'var(--fg-dim)' }}>{state.canonOutcome.summary}</div>}
        </div>
      )}

      {showComplete && state.status !== 'completed' && (
        <CompleteForm campaignId={campaignId} onDone={() => setShowComplete(false)} />
      )}

      <div className="atlas-detail-cols" style={{ marginTop: 16 }}>
        <div>
          <div className="atlas-section" style={{ marginTop: 0 }}>
            <h2>Текущая сцена</h2>
            {activeScene ? (
              <div className="atlas-panel">
                <h3>{activeScene.title} <span className="scene-order">#{activeScene.order} · {activeScene.type}</span></h3>
                <p style={{ marginTop: 8 }}>{activeScene.dmText}</p>
                {activeScene.objectives && activeScene.objectives.length > 0 && (
                  <ul style={{ marginTop: 8 }}>{activeScene.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
                )}
                {activeScene.secrets && activeScene.secrets.length > 0 && (
                  <div className="atlas-dm-block" style={{ marginTop: 10 }}>
                    <div className="atlas-dm-label">Секреты сцены</div>
                    <ul>{activeScene.secrets.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {activeScene.regionId && (
                  <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--fg-faint)' }}>
                    Регион: {getRegionById(activeScene.regionId)?.titleRu ?? activeScene.regionId}
                  </div>
                )}
              </div>
            ) : <p className="atlas-empty">Сцен нет.</p>}
          </div>

          {scenes.length > 0 && (
            <div className="atlas-section">
              <h2>Сцены</h2>
              <div className="atlas-scene-list">
                {scenes.map((sc) => {
                  const done = state.completedSceneIds.includes(sc.id);
                  const active = sc.id === activeScene?.id;
                  return (
                    <div key={sc.id} className={`atlas-scene${active ? ' active' : ''}${done ? ' done' : ''}`}>
                      <h3>
                        <span>{sc.title}</span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button className="atlas-btn ghost small" onClick={() => runtime.setActiveScene(campaignId, sc.id)}>{active ? 'Текущая' : 'Перейти'}</button>
                          <button className="atlas-btn ghost small" onClick={() => runtime.markSceneComplete(campaignId, sc.id, !done)}>{done ? 'Снять ✓' : 'Готово ✓'}</button>
                        </span>
                      </h3>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="atlas-section">
            <h2>Battle Tracker</h2>
            <div className="atlas-panel">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input className="atlas-input" placeholder="Имя бойца…" value={newCombatant} onChange={(e) => setNewCombatant(e.target.value)} style={{ minWidth: 0, flex: 1 }} />
                <button className="atlas-btn small" onClick={() => {
                  if (!newCombatant.trim()) return;
                  runtime.addCombatant(campaignId, { id: `cbt-${Date.now()}`, name: newCombatant.trim(), currentHp: 10, maxHp: 10 });
                  setNewCombatant('');
                }}>Добавить</button>
              </div>
              {state.battleTracker.combatants.length > 0 ? (
                <>
                  <div className="atlas-tracker-row" style={{ color: 'var(--fg-faint)', fontSize: '0.75rem' }}>
                    <span>Имя</span><span>Иниц.</span><span>HP</span><span>Статусы</span><span></span>
                  </div>
                  {state.battleTracker.combatants.map((c) => (
                    <div key={c.id} className="atlas-tracker-row">
                      <span>{c.name}</span>
                      <input type="number" value={c.initiative ?? ''} onChange={(e) => runtime.updateCombatant(campaignId, c.id, { initiative: Number(e.target.value) })} />
                      <input type="number" value={c.currentHp ?? ''} onChange={(e) => runtime.updateCombatant(campaignId, c.id, { currentHp: Number(e.target.value) })} />
                      <input value={(c.statuses ?? []).join(', ')} onChange={(e) => runtime.updateCombatant(campaignId, c.id, { statuses: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                      <button className="atlas-btn ghost small" onClick={() => runtime.removeCombatant(campaignId, c.id)}>✕</button>
                    </div>
                  ))}
                </>
              ) : <p className="atlas-empty">Бойцов нет.</p>}
            </div>
          </div>
        </div>

        <aside>
          {activeMap && (
            <div className="atlas-section" style={{ marginTop: 0 }}>
              <h2>Карта</h2>
              <img className="atlas-map-img" src={activeMap.imageSrc} alt={activeMap.titleRu ?? activeMap.title} loading="lazy" />
              {campaign.mapIds.length > 1 && (
                <div className="atlas-taglist" style={{ marginTop: 8 }}>
                  {campaign.mapIds.map((mid) => {
                    const m = getAtlasMapById(mid);
                    return <button key={mid} className="atlas-btn ghost small" onClick={() => runtime.setActiveMap(campaignId, mid)}>{m?.titleRu ?? m?.title ?? mid}</button>;
                  })}
                </div>
              )}
            </div>
          )}

          <div className="atlas-section">
            <h2>Quick notes</h2>
            <div className="atlas-panel">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input className="atlas-input" placeholder="Заметка…" value={note} onChange={(e) => setNote(e.target.value)} style={{ minWidth: 0, flex: 1 }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { runtime.addNote(campaignId, note.trim()); setNote(''); } }} />
                <button className="atlas-btn small" onClick={() => { if (note.trim()) { runtime.addNote(campaignId, note.trim()); setNote(''); } }}>+</button>
              </div>
              {state.notes.length > 0
                ? <ul className="atlas-notes-log">{state.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                : <p className="atlas-empty">Пока нет заметок.</p>}
            </div>
          </div>

          {adv?.playerSafeText && adv.playerSafeText.length > 0 && (
            <div className="atlas-section">
              <h2>Player Safe</h2>
              <div className="atlas-panel">{adv.playerSafeText.map((t, i) => <p key={i} style={{ margin: '0 0 6px' }}>{t}</p>)}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
