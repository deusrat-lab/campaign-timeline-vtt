import { useRef, useState } from 'react';
import { db, updateSettings } from '../db/db';
import { useSettings } from '../hooks/useDb';
import { ConfirmButton, useToast } from '../components/ui';
import {
  applyBackup,
  downloadBackup,
  exportBackup,
  parseBackup,
  type ImportMode,
  type ImportPreview,
} from '../features/backup/backup';
import { loadDemoData } from '../features/backup/demo';
import { uk } from '../i18n';

export function SettingsPage() {
  const settings = useSettings();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingRaw, setPendingRaw] = useState('');
  const [mode, setMode] = useState<ImportMode>('replace');

  async function onExport() {
    const backup = await exportBackup();
    downloadBackup(backup);
    await updateSettings({ backupReminderAt: new Date().toISOString().slice(0, 10) });
    toast({ message: 'Резервну копію збережено' });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    setPendingRaw(raw);
    setPreview(parseBackup(raw));
  }

  async function confirmImport() {
    if (!preview?.ok || !preview.backup) return;
    // Автоматична резервна копія поточної бази перед імпортом.
    downloadBackup(await exportBackup());
    await applyBackup(preview.backup, mode);
    setPreview(null);
    setPendingRaw('');
    toast({ message: 'Дані імпортовано' });
  }

  async function wipeAll() {
    await Promise.all(db.tables.map((t) => t.clear()));
    location.reload();
  }

  return (
    <>
      <h1>{uk.nav.settings}</h1>

      <div className="section-title">Вигляд</div>
      <div className="card">
        <div className="field">
          <label>Тема</label>
          <select className="input" value={settings?.theme ?? 'system'} onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' | 'system' })}>
            <option value="system">Системна</option>
            <option value="light">Світла</option>
            <option value="dark">Темна</option>
          </select>
        </div>
        <label className="row" style={{ cursor: 'pointer' }}>
          <span>Приховувати суми на екрані</span>
          <input type="checkbox" checked={settings?.hideAmounts ?? false} onChange={(e) => updateSettings({ hideAmounts: e.target.checked })} />
        </label>
      </div>

      <div className="section-title">{uk.backup.title}</div>
      <div className="card">
        <p className="small" style={{ color: 'var(--warn)' }}>⚠️ {uk.backup.warning}</p>
        <button className="btn primary block mb" onClick={onExport}>⬇️ {uk.backup.export}</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={onFile} />
        <button className="btn block" onClick={() => fileRef.current?.click()}>⬆️ {uk.backup.import}</button>

        {preview && (
          <div className="card mt" style={{ background: 'var(--surface-2)' }}>
            {preview.ok ? (
              <>
                <p className="small">Знайдено: {Object.entries(preview.counts ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                <div className="chip-row mb">
                  <button className={`chip ${mode === 'replace' ? 'selected' : ''}`} onClick={() => setMode('replace')}>{uk.backup.replace}</button>
                  <button className={`chip ${mode === 'merge' ? 'selected' : ''}`} onClick={() => setMode('merge')}>{uk.backup.merge}</button>
                </div>
                <p className="small muted">Перед імпортом буде автоматично збережено копію поточної бази.</p>
                <div className="row">
                  <button className="btn" onClick={() => setPreview(null)}>{uk.common.cancel}</button>
                  <button className="btn primary" style={{ flex: 1, marginLeft: 8 }} onClick={confirmImport}>{uk.common.confirm}</button>
                </div>
              </>
            ) : (
              <p className="small" style={{ color: 'var(--danger)' }}>{preview.error}</p>
            )}
            {void pendingRaw}
          </div>
        )}
      </div>

      <div className="section-title">Розробка</div>
      <div className="card">
        <button className="btn block" onClick={async () => { await loadDemoData(); toast({ message: 'Демо-дані завантажено' }); location.assign('/'); }}>
          🧪 Завантажити демонстраційні дані
        </button>
      </div>

      <div className="section-title" style={{ color: 'var(--danger)' }}>Небезпечна зона</div>
      <div className="card">
        <p className="small muted">Повне очищення видалить усю локальну статистику без можливості відновлення (окрім резервної копії).</p>
        <ConfirmButton className="btn danger block" label="Очистити всі дані" confirmText="Натисніть ще раз для остаточного очищення" onConfirm={wipeAll} />
      </div>

      <p className="center muted small mt">Мій бюджет · v0.1.0 · дані зберігаються лише на цьому пристрої</p>
    </>
  );
}
