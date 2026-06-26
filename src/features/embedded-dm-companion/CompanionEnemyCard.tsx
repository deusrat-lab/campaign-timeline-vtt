import { useState } from 'react';
import type { DmCustomEnemy, DmImageItem } from '../../types/dmCompanion';
import { resolveEntityPreviewImage } from '../../pages/map-workspace/libraryCards';
import { CompanionLinkRow } from './CompanionLinkRow';
import { ImageLightbox } from './ImageLightbox';

/**
 * Ported field order from dm-companion's real `pages/enemies/EnemyDetailPage.tsx`:
 * base monster/CR/XP tags → hero image → AC/HP/speed → ability scores →
 * attacks → features → reactions → legendary actions → senses/languages →
 * role/faction → lore → tactics (DM-only) → linked locations/quests → DM
 * notes (DM-only).
 *
 * DM-gating: stats/tactics/DM notes render unconditionally because this
 * card is only ever reached through `isDmMode`-gated entry points (the
 * EmbeddedCompanionWindow host itself, plus every Library/right-panel/
 * linked-row opener) — same convention as CompanionLocationCard's
 * dmSecrets block. There is no player-facing rendering path for this card.
 *
 * Enemy editing stays read-only, same reasoning as quests: no
 * override-patch mechanism exists for enemies yet in this app.
 */
export function CompanionEnemyCard({
  enemy,
  locations,
  quests,
  images,
  onOpenLocation,
  onOpenQuest,
}: {
  enemy: DmCustomEnemy;
  locations: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  images: DmImageItem[];
  onOpenLocation?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
}) {
  const hero = resolveEntityPreviewImage('enemy', enemy, images);
  const locationItems = (enemy.locationIds ?? []).map((id) => ({ id, label: locations.find((l) => l.id === id)?.name ?? id }));
  const questItems = (enemy.questIds ?? []).map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  const abilityLabels: Record<string, string> = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{enemy.name}</h3>
        <span className="muted">
          {enemy.baseMonsterName ? `Base: ${enemy.baseMonsterName} · ` : ''}
          {enemy.cr ? `CR ${enemy.cr}` : ''}
          {enemy.xp !== undefined ? ` · ${enemy.xp} XP` : ''}
          {enemy.tags?.length ? ` · ${enemy.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && (
        <button type="button" className="companion-source-hero-wrap" onClick={() => setLightboxOpen(true)}>
          <img className="companion-source-hero" src={hero.thumbnailSrc ?? hero.src} alt={enemy.name} />
        </button>
      )}
      {hero && lightboxOpen && (
        <ImageLightbox image={{ ...hero, title: hero.title ?? enemy.name }} onClose={() => setLightboxOpen(false)} />
      )}
      <div className="companion-enemy-stats">
        {enemy.ac !== undefined && (
          <div className="companion-enemy-stat">
            <span className="muted">AC</span>
            <strong>{enemy.ac}</strong>
          </div>
        )}
        {enemy.hp !== undefined && (
          <div className="companion-enemy-stat">
            <span className="muted">HP</span>
            <strong>{enemy.hp}</strong>
          </div>
        )}
        {enemy.speed && (
          <div className="companion-enemy-stat">
            <span className="muted">Скорость</span>
            <strong>{enemy.speed}</strong>
          </div>
        )}
      </div>
      {enemy.abilityScores && (
        <div className="companion-enemy-stats">
          {Object.entries(enemy.abilityScores).map(([key, value]) => (
            <div key={key} className="companion-enemy-stat">
              <span className="muted">{abilityLabels[key] ?? key.toUpperCase()}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {!!enemy.attacks?.length && (
        <>
          <h4>Атаки</h4>
          <ul className="companion-item-list">
            {enemy.attacks.map((a, i) => (
              <li key={i}>
                <strong>{a.name}.</strong>
                {a.toHit ? ` Атака ${a.toHit},` : ''}
                {a.range ? ` ${a.range},` : ''}
                {a.damage ? ` урон ${a.damage}.` : ''}
                {a.description ? ` ${a.description}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!enemy.features?.length && (
        <>
          <h4>Способности</h4>
          <ul className="companion-item-list">
            {enemy.features.map((f, i) => (
              <li key={i}>
                <strong>{f.name}.</strong> {f.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!enemy.reactions?.length && (
        <>
          <h4>Реакции</h4>
          <ul className="companion-item-list">
            {enemy.reactions.map((r, i) => (
              <li key={i}>
                <strong>{r.name}.</strong> {r.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!enemy.legendaryActions?.length && (
        <>
          <h4>Легендарные действия</h4>
          <ul className="companion-item-list">
            {enemy.legendaryActions.map((a, i) => (
              <li key={i}>
                <strong>{a.name}.</strong> {a.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {(enemy.senses || enemy.languages) && (
        <>
          {enemy.senses && (
            <>
              <h4>Чувства</h4>
              <p>{enemy.senses}</p>
            </>
          )}
          {enemy.languages && (
            <>
              <h4>Языки</h4>
              <p>{enemy.languages}</p>
            </>
          )}
        </>
      )}
      {enemy.role && (
        <>
          <h4>Роль</h4>
          <p>{enemy.role}</p>
        </>
      )}
      {enemy.faction && (
        <>
          <h4>Фракция</h4>
          <p>{enemy.faction}</p>
        </>
      )}
      {enemy.lore && (
        <>
          <h4>Лор</h4>
          <p>{enemy.lore}</p>
        </>
      )}
      {enemy.tactics && (
        <>
          <h4>Тактика (DM-ONLY)</h4>
          <p>{enemy.tactics}</p>
        </>
      )}
      {!!locationItems.length && (
        <>
          <h4>Локации</h4>
          {onOpenLocation ? (
            <CompanionLinkRow items={locationItems} onOpen={onOpenLocation} />
          ) : (
            <p>{locationItems.map((i) => i.label).join(', ')}</p>
          )}
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {enemy.dmNotes && (
        <>
          <h4>Заметки мастера (DM-ONLY)</h4>
          <p className="muted">{enemy.dmNotes}</p>
        </>
      )}
      <p className="muted companion-readonly-note">
        Редактирование врагов будет добавлено отдельным этапом. Сейчас используется исходная карточка DM Companion.
      </p>
    </div>
  );
}
