import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { previewUserCampaignImport, userCampaignExportHash, type UserCampaignImportPreview } from '../../domain';

/**
 * Stage 17 — DM-only campaign management surface: universal export (DM /
 * Player-Safe) and import-as-new-campaign with a dry-run preview. Uses the
 * universal portability pipeline through the user-campaign store; it is a normal
 * management UI (not a diagnostics-only / debug surface). Import defaults to a
 * dry-run preview; applying is an explicit second action that creates a NEW,
 * isolated campaign.
 */
export function CampaignManagementPanel() {
  const navigate = useNavigate();
  const { registry, exportUniversal, importUniversalApply, createUniversalBackup, restoreUniversalBackup } = useUserCampaigns();
  const [exportText, setExportText] = useState('');
  const [exportInfo, setExportInfo] = useState('');
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<UserCampaignImportPreview | null>(null);
  const [backupInfo, setBackupInfo] = useState('');

  function download(name: string, text: string) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* download best-effort; the text area still holds the export */
    }
  }

  function doExport(id: string, title: string, playerSafe: boolean) {
    const text = exportUniversal(id, playerSafe);
    if (!text) { setExportInfo('Экспорт не удался.'); return; }
    setExportText(text);
    setExportInfo(`${playerSafe ? 'Player-Safe' : 'DM'} экспорт: ${title} · hash ${userCampaignExportHash(text)} · ${text.length} символов`);
    download(`${title.replace(/\s+/g, '-')}${playerSafe ? '.player-safe' : ''}.universal.json`, text);
  }

  function doPreview() {
    setPreview(previewUserCampaignImport(importText));
  }

  function doApply() {
    const newId = importUniversalApply(importText);
    if (!newId) { setPreview({ ok: false, format: 'unknown', errors: ['import apply failed'] }); return; }
    setImportText('');
    setPreview(null);
    navigate(`/campaigns/${newId}/map`);
  }

  return (
    <div className="atlas-section" data-testid="campaign-management">
      <h2>Управление кампаниями (Stage 17)</h2>
      <div className="atlas-panel" style={{ display: 'grid', gap: 12 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Экспорт</h3>
          {registry.length === 0 ? <p className="atlas-empty" style={{ margin: 0 }}>Нет пользовательских кампаний.</p> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {registry.map((c) => (
                <div key={c.campaignId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{c.title}</strong>
                  <button className="atlas-btn small" data-testid={`export-dm-${c.campaignId}`} onClick={() => doExport(c.campaignId, c.title, false)}>Экспорт (DM)</button>
                  <button className="atlas-btn ghost small" data-testid={`export-ps-${c.campaignId}`} onClick={() => doExport(c.campaignId, c.title, true)}>Экспорт (Player Safe)</button>
                  <button className="atlas-btn ghost small" data-testid={`backup-${c.campaignId}`} onClick={() => { const r = createUniversalBackup(c.campaignId); setBackupInfo(r ? `Резервная копия «${c.title}»: hash ${r.hash} @ ${r.at}` : 'Резервная копия не удалась.'); }}>Создать бэкап</button>
                  <button className="atlas-btn small" data-testid={`restore-${c.campaignId}`} onClick={() => { const r = restoreUniversalBackup(c.campaignId); setBackupInfo(r.ok ? `Восстановлено «${c.title}»: hash ${r.restoredHash}, rollback ${r.rollbackHash ?? '—'}` : `Восстановление отклонено: ${r.errors.join('; ')}`); }}>Восстановить бэкап</button>
                </div>
              ))}
            </div>
          )}
          {exportInfo && <p data-testid="export-info" style={{ marginBottom: 4 }}>{exportInfo}</p>}
          {backupInfo && <p data-testid="backup-info" style={{ marginBottom: 4 }}>{backupInfo}</p>}
          {exportText && <textarea data-testid="export-output" readOnly value={exportText} rows={4} style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} />}
        </div>

        <div>
          <h3>Импорт как новая кампания</h3>
          <input type="file" accept="application/json,.json" data-testid="import-file" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const text = await file.text(); setImportText(text); setPreview(previewUserCampaignImport(text));
          }} />
          <textarea data-testid="import-input" value={importText} onChange={(e) => { setImportText(e.target.value); setPreview(null); }} rows={4} placeholder="Вставьте universal export JSON…" style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, marginTop: 6 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="atlas-btn small" data-testid="import-preview" onClick={doPreview} disabled={!importText.trim()}>Предпросмотр (dry-run)</button>
            <button className="atlas-btn small" data-testid="import-apply" onClick={doApply} disabled={!preview?.ok}>Импортировать как новую кампанию</button>
          </div>
          {preview && (
            <div data-testid="import-preview-result" style={{ marginTop: 6 }}>
              <p style={{ margin: 0 }}>Формат: {preview.format} · тип: {preview.kind ?? '—'} · кампания: {preview.title ?? '—'} · boards: {preview.boardCount ?? '—'} · tokens: {preview.tokenCount ?? '—'} · {preview.ok ? '✅ готово к импорту' : '❌ отклонено'}</p>
              {preview.errors.length > 0 && <ul style={{ margin: '4px 0', color: '#c66' }}>{preview.errors.map((err, i) => <li key={i} data-testid="import-error">{err}</li>)}</ul>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
