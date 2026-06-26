import { useState } from 'react';
import { useCampaignStore } from '../../state/campaignStore';

/**
 * Extracted from MapWorkspacePage.tsx (Etap D decomposition) — self-contained
 * aside from useCampaignStore(), which it already called directly (the page
 * never passed battleMapVttUrlOverrides down as a prop), so this lift is
 * behavior-identical.
 *
 * There is no reliable automatic id mapping between dm-companion battle map
 * ids and battle-map-vtt's own map ids (see BattleMapLink in ../../types), so
 * "Открыть Battle Map VTT" can only deep-link once the DM has pasted the real
 * battle-map-vtt URL here once. Without it, the button just opens the app's
 * base URL — never a fake/guessed deep link.
 */
export function BattleMapVttLinkField({ battleMapId }: { battleMapId: string }) {
  const store = useCampaignStore();
  const saved = store.battleMapVttUrlOverrides[battleMapId] ?? '';
  const [draft, setDraft] = useState(saved);
  // "Adjusting state when a prop changes" — done directly during render
  // (React's own recommended replacement for an effect here, see
  // https://react.dev/learn/you-might-not-need-an-effect), not in a
  // useEffect, so there's no setState-in-effect cascading-render concern.
  const [prevSaved, setPrevSaved] = useState(saved);
  if (saved !== prevSaved) {
    setPrevSaved(saved);
    setDraft(saved);
  }
  return (
    <div className="battle-map-vtt-link-field">
      <label>
        Ссылка на конкретную карту в Battle Map VTT (необязательно)
        <input
          type="text"
          value={draft}
          placeholder="http://localhost:5174/#/maps/map-xxxxxxxx/play"
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <button disabled={draft === saved} onClick={() => store.setBattleMapVttUrl(battleMapId, draft.trim())}>
        Сохранить ссылку
      </button>
    </div>
  );
}
