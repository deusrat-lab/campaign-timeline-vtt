import type { BattleEntry, BattleMapVariantKind, BattleMapVariantRef } from '../../types';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import { getBattleMapById, getBattleMapDisplayName, getBattleMapPreviewUrl } from './battleMapManifestHelpers';
import { resolveEncounterPreset } from './encounterPresetResolver';
import { resolveBattleEntryLinkedEnemies, resolveBattleEntrySourceLocation } from './battleEntryLinks';
import type { CampaignData } from '../../data/loadCampaignData';

/**
 * Stage 5C, Step 8 — pre-launch summary panel. Genuinely new component (no
 * prior equivalent existed: BattleEntryPanel only ever had a bare variant
 * <select> + "Открыть Battle Map VTT" button with no summary/warnings view).
 *
 * Pure display + a single "Открыть Battle Map" action that hands off to the
 * EXISTING `buildBattleMapLaunchUrl` (passed in by the caller, not
 * reimplemented here) — this component never constructs a URL itself.
 */
const VARIANT_KIND_LABELS: Record<BattleMapVariantKind, string> = {
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
  rain: 'Дождь',
  destroyed: 'Разрушено',
  custom: 'Своё',
};

export interface BattleMapLaunchPanelProps {
  entry: BattleEntry;
  data: CampaignData;
  selectedVariant: BattleMapVariantRef | undefined;
  selectedEncounterPresetId: string | undefined;
  /** True when buildBattleMapLaunchUrl's `returnUrl` context param would
   * actually be populated for this launch. Stage 5D, Step 3: BattleEntryPanel
   * now computes this from a real `buildBattleReturnUrl()` call (see
   * battleReturnUrl.ts) — true under normal Campaign Map usage in a real
   * browser, false only in a non-window environment. */
  hasReturnUrl: boolean;
  onLaunch: () => void;
  launchWarning?: string | null;
}

export function BattleMapLaunchPanel({
  entry,
  data,
  selectedVariant,
  selectedEncounterPresetId,
  hasReturnUrl,
  onLaunch,
  launchWarning,
}: BattleMapLaunchPanelProps) {
  const effectiveBattleMapId = selectedVariant?.battleMapId ?? entry.battleMapId;
  const effectiveBattleMapUrl = selectedVariant?.battleMapUrl ?? entry.battleMapUrl;
  const manifestEntry: BattleMapManifestEntry | undefined = getBattleMapById(data.battleMaps, effectiveBattleMapId);
  const previewUrl = getBattleMapPreviewUrl(manifestEntry);

  const linkedEnemies = resolveBattleEntryLinkedEnemies(entry, data);
  const sourceLocation = resolveBattleEntrySourceLocation(entry, data);
  const resolvedPreset = selectedEncounterPresetId ? resolveEncounterPreset(selectedEncounterPresetId) : undefined;

  const warnings: string[] = [];
  if (!effectiveBattleMapId && !effectiveBattleMapUrl) {
    warnings.push('Ни у сцены, ни у выбранного варианта нет battleMapId/battleMapUrl — карта не откроется.');
  }
  if (effectiveBattleMapId && !manifestEntry) {
    warnings.push(`battleMapId «${effectiveBattleMapId}» не найден в манифесте battle-map-vtt.`);
  }
  if (selectedVariant && !selectedVariant.battleMapId && !selectedVariant.battleMapUrl && !entry.battleMapId && !entry.battleMapUrl) {
    warnings.push('У выбранного варианта нет своей карты, и нет карты сцены по умолчанию для отката.');
  }
  if (entry.encounterPresetIds && entry.encounterPresetIds.length > 0 && !selectedEncounterPresetId) {
    warnings.push('Заготовка энкаунтера не выбрана для запуска.');
  }
  if (!hasReturnUrl) {
    warnings.push('returnUrl не передаётся (нет доступа к адресу страницы) — после боя нужно будет вручную открыть карту и применить последствия.');
  }

  return (
    <div className="session-panel-section battle-launch-summary">
      <p className="side-panel-subheading">Перед запуском</p>

      <p className="session-panel-row">
        <strong>Карта боя:</strong>{' '}
        {effectiveBattleMapId
          ? getBattleMapDisplayName(manifestEntry, effectiveBattleMapId)
          : effectiveBattleMapUrl
            ? effectiveBattleMapUrl
            : 'не настроена'}
      </p>

      <p className="session-panel-row">
        <strong>Вариант:</strong> {selectedVariant ? `${selectedVariant.name} (${VARIANT_KIND_LABELS[selectedVariant.kind]})` : 'карта сцены по умолчанию'}
      </p>

      <p className="session-panel-row">
        <strong>Заготовка энкаунтера:</strong>{' '}
        {resolvedPreset ? `${resolvedPreset.name} (не найдена в данных)` : 'не выбрана'}
      </p>

      <p className="session-panel-row">
        <strong>Связанные враги ({linkedEnemies.length}):</strong>{' '}
        {linkedEnemies.length === 0
          ? '—'
          : linkedEnemies.map((e) => (
              <span key={e.id} className={`linked-entity-chip${e.missing ? ' linked-entity-chip--missing' : ''}`}>
                {e.label}
              </span>
            ))}
      </p>

      {entry.recommendedPartyLevel !== undefined && (
        <p className="session-panel-row">
          <strong>Рекоменд. уровень партии:</strong> {entry.recommendedPartyLevel}
        </p>
      )}

      <p className="session-panel-row">
        <strong>Размер сцены:</strong> {entry.sceneSize}
      </p>

      <p className="session-panel-row">
        <strong>Локация-источник:</strong> {sourceLocation ? sourceLocation.label : 'не привязана'}
      </p>

      <p className={`session-panel-row ${hasReturnUrl ? 'battle-return-ready' : 'battle-return-warning'}`}>
        <strong>Возврат после боя:</strong>{' '}
        {hasReturnUrl ? 'returnUrl будет передан — Battle Map сможет вернуть ДМ сюда' : 'returnUrl недоступен'}
      </p>

      {previewUrl && (
        <div className="battle-map-preview">
          <img src={previewUrl} alt={getBattleMapDisplayName(manifestEntry, effectiveBattleMapId ?? '')} loading="lazy" />
        </div>
      )}

      {warnings.map((w) => (
        <p key={w} className="battle-launch-warning">
          {w}
        </p>
      ))}

      <div className="actions">
        <button onClick={onLaunch}>Открыть Battle Map</button>
      </div>
      {launchWarning && <p className="form-error">{launchWarning}</p>}
    </div>
  );
}
