import type { DmLocation } from '../../types/dmCompanion';
import { CompanionLinkRow } from './CompanionLinkRow';

/**
 * Ported field order/content from dm-companion's real
 * `pages/locations/LocationDetailPage.tsx`: name/type/region header →
 * description → atmosphere → lore → "what players see" → rumors → quick
 * scenes → linked NPCs → linked quests → DM-only secrets/notes.
 *
 * DM-gating: this card is only ever reached through `isDmMode`-gated entry
 * points (EmbeddedCompanionWindow is only mounted when `isDmMode` is true in
 * MapWorkspacePage.tsx), so the dmSecrets/notes block renders
 * unconditionally here, matching the established convention for every
 * other DM-only block in this directory.
 */
export function CompanionLocationCard({
  loc,
  npcs,
  quests,
  onOpenNpc,
  onOpenQuest,
}: {
  loc: DmLocation;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  onOpenNpc?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
}) {
  const npcItems = loc.npcs.map((id) => ({ id, label: npcs.find((n) => n.id === id)?.name ?? id }));
  const questItems = loc.quests.map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{loc.name}</h3>
        <span className="muted">
          {loc.type}
          {loc.region ? ` · ${loc.region}` : ''}
        </span>
      </div>
      <p>{loc.description}</p>
      {loc.atmosphere && (
        <>
          <h4>Атмосфера</h4>
          <p>{loc.atmosphere}</p>
        </>
      )}
      {loc.lore && (
        <>
          <h4>Лор</h4>
          <p>{loc.lore}</p>
        </>
      )}
      {loc.playerView && (
        <>
          <h4>Что видят игроки</h4>
          <p>{loc.playerView}</p>
        </>
      )}
      {!!loc.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {loc.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {!!loc.quickScenes?.length && (
        <>
          <h4>Быстрые сцены</h4>
          <ul>
            {loc.quickScenes.map((s, i) => (
              <li key={i}>
                <strong>{s.title}</strong> — {s.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!npcItems.length && (
        <>
          <h4>NPC здесь</h4>
          {onOpenNpc ? <CompanionLinkRow items={npcItems} onOpen={onOpenNpc} /> : <p>{npcItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Квесты здесь</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {(loc.dmSecrets || loc.notes) && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          {loc.dmSecrets && <p>{loc.dmSecrets}</p>}
          {loc.notes && <p className="muted">{loc.notes}</p>}
        </>
      )}
    </div>
  );
}
