import { useState } from 'react';

/** Filterable checkbox list — used by MapWorkspacePage's entity-link pickers
 * (NPC/quest/enemy/image/battle-map link editors). Extracted out of the
 * unrouted `LocationPage.tsx` (Stage 5G) so this small, genuinely-shared
 * component isn't dragged in as a side effect of importing a dead route. */
export function CheckboxList({
  items,
  selectedIds,
  onToggle,
  labelOf,
}: {
  items: { id: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  labelOf: (item: { id: string }) => string;
}) {
  const [search, setSearch] = useState('');
  const filtered = items.filter((i) => labelOf(i).toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <input type="search" placeholder="Фильтр…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="checkbox-list">
        {filtered.map((item) => (
          <label key={item.id}>
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => onToggle(item.id)} />
            {labelOf(item)}
          </label>
        ))}
      </div>
    </div>
  );
}
