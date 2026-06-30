import { useState } from 'react';
import type { DmQuest, DmImageItem, DmCustomEnemy } from '../../types/dmCompanion';
import type { QuestStatus } from '../../types';
import { resolveEntityPreviewImage } from '../../pages/map-workspace/libraryCards';
import { CompanionLinkRow } from './CompanionLinkRow';
import { CompanionEnemyCard } from './CompanionEnemyCard';
import { ImageLightbox } from './ImageLightbox';
import { useCampaignData } from '../../state/campaignDataContext';

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: 'Активен',
  completed: 'Завершён',
  failed: 'Провален',
  hidden: 'Скрыт',
};

/**
 * Ported field order from dm-companion's real `pages/quests/QuestDetailPage.tsx`:
 * status/tags → hero image → location → giver → goal → description →
 * linked enemies → reward → proof → solutions → consequences → notes.
 */
export function CompanionQuestCard({
  quest,
  npcs,
  enemies,
  images,
  locationName,
  onOpenNpc,
  onOpenLocation,
  onOpenEnemy,
  onEditEnemy,
  onRemoveEnemy,
}: {
  quest: DmQuest;
  npcs: { id: string; name: string; role?: string; image?: string }[];
  enemies: DmCustomEnemy[];
  images: DmImageItem[];
  locationName?: string;
  onOpenNpc?: (id: string) => void;
  onOpenLocation?: (id: string) => void;
  onOpenEnemy?: (id: string) => void;
  onEditEnemy?: (id: string) => void;
  onRemoveEnemy?: (id: string) => void;
}) {
  const { data } = useCampaignData();
  const hero = resolveEntityPreviewImage('quest', quest, images);
  const giver = quest.giver ? npcs.find((n) => n.id === quest.giver) : undefined;
  const enemyCards = (quest.enemies ?? []).map((id) => enemies.find((e) => e.id === id)).filter((e): e is DmCustomEnemy => Boolean(e));
  const missingEnemyItems = (quest.enemies ?? [])
    .filter((id) => !enemyCards.some((enemy) => enemy.id === id))
    .map((id) => ({ id, label: id }));
  const solutions = Array.isArray(quest.solutions)
    ? quest.solutions
    : quest.solutions
      ? [quest.solutions]
      : [];
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const factionLabels = Array.from(new Set([...(quest.factionIds ?? []), quest.primaryFactionId].filter(Boolean) as string[]))
    .map((id) => data?.factions.find((f) => f.id === id || f.name === id || f.shortName === id)?.shortName ?? data?.factions.find((f) => f.id === id || f.name === id || f.shortName === id)?.name ?? id);

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{quest.title}</h3>
        <span className="muted">
          {QUEST_STATUS_LABELS[quest.status]}
          {quest.tags?.length ? ` · ${quest.tags.join(', ')}` : ''}
        </span>
        {!!factionLabels.length && (
          <div className="companion-tag-row">
            {factionLabels.map((label) => (
              <span key={label} className="companion-tag-chip">{label}</span>
            ))}
          </div>
        )}
      </div>
      {hero && (
        <button type="button" className="companion-source-hero-wrap" onClick={() => setLightboxOpen(true)}>
          <img className="companion-source-hero" src={hero.thumbnailSrc ?? hero.src} alt={quest.title} />
        </button>
      )}
      {!hero && (
        <div className="companion-source-hero-wrap companion-source-hero-wrap--empty" aria-label="Изображение не привязано">
          <span className="companion-source-hero-placeholder">Нет изображения</span>
        </div>
      )}
      {hero && lightboxOpen && (
        <ImageLightbox image={{ ...hero, title: hero.title ?? quest.title }} onClose={() => setLightboxOpen(false)} />
      )}
      {locationName && (
        <>
          <h4>Локация</h4>
          {onOpenLocation ? (
            <CompanionLinkRow items={[{ id: quest.location, label: locationName }]} onOpen={onOpenLocation} />
          ) : (
            <p>{locationName}</p>
          )}
        </>
      )}
      {giver && (
        <>
          <h4>Квестодатель</h4>
          {onOpenNpc ? (
            <CompanionLinkRow
              items={[{
                id: giver.id,
                label: giver.name,
                subtitle: giver.role,
                imageSrc: giver.image
                  ? (giver.image.startsWith('/') || giver.image.startsWith('http')
                    ? giver.image
                    : images.find((image) => image.id === giver.image)?.thumbnailSrc ?? images.find((image) => image.id === giver.image)?.src)
                  : undefined,
              }]}
              onOpen={onOpenNpc}
            />
          ) : <p>{giver.name}</p>}
        </>
      )}
      {quest.goal && (
        <>
          <h4>Цель</h4>
          <p>{quest.goal}</p>
        </>
      )}
      {quest.description && (
        <>
          <h4>Описание</h4>
          <p>{quest.description}</p>
        </>
      )}
      {(!!enemyCards.length || !!missingEnemyItems.length) && (
        <>
          <h4>Враги</h4>
          {!!enemyCards.length && (
            <div className="quest-enemy-card-grid">
              {enemyCards.map((enemy) => (
                <article key={enemy.id} className="quest-enemy-card">
                  <CompanionEnemyCard
                    enemy={enemy}
                    locations={[]}
                    quests={[]}
                    images={images}
                  />
                  {(onOpenEnemy || onEditEnemy || onRemoveEnemy) && (
                    <div className="quest-enemy-card-actions">
                      {onOpenEnemy && <button type="button" onClick={() => onOpenEnemy(enemy.id)}>Открыть</button>}
                      {onEditEnemy && <button type="button" onClick={() => onEditEnemy(enemy.id)}>Редактировать</button>}
                      {onRemoveEnemy && <button type="button" className="btn-danger" onClick={() => onRemoveEnemy(enemy.id)}>Убрать из квеста</button>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {!!missingEnemyItems.length && (
            onOpenEnemy ? <CompanionLinkRow items={missingEnemyItems} onOpen={onOpenEnemy} /> : <p>{missingEnemyItems.map((i) => i.label).join(', ')}</p>
          )}
        </>
      )}
      {quest.reward && (
        <>
          <h4>Награда</h4>
          <p>{quest.reward}</p>
        </>
      )}
      {quest.proof && (
        <>
          <h4>Подтверждение выполнения</h4>
          <p>{quest.proof}</p>
        </>
      )}
      {!!solutions.length && (
        <>
          <h4>Варианты решения</h4>
          <ul>
            {solutions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {quest.consequences && (
        <>
          <h4>Последствия</h4>
          <p>{quest.consequences}</p>
        </>
      )}
      {quest.notes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{quest.notes}</p>
        </>
      )}
    </div>
  );
}
