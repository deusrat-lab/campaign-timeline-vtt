import { useMemo, useState } from 'react';
import { useCampaignData } from '../state/campaignDataContext';
import type { DmEconomyReferenceItem } from '../types/dmCompanion';
import { formatGpTotal, parseAnyPrice, toGp } from '../features/embedded-dm-companion/currency';

const RARE_AVAILABILITY = new Set(['под заказ', 'через гильдию', 'ограничено законом', 'почти недоступно']);

type SortMode = 'default' | 'cheapest' | 'rare';

interface SoldItem {
  id: string;
  name: string;
  qty: number;
  unitSellGp: number;
  conditionId: string;
}

const SELL_CONDITIONS = [
  { id: 'good', label: 'Хорошее состояние', min: 0.5, max: 0.5, note: 'Обычный выкуп около 50% от цены нового предмета.' },
  { id: 'damaged', label: 'Поврежденное', min: 0.1, max: 0.3, note: 'Видимые повреждения: 10-30% от цены.' },
  { id: 'poor', label: 'Плохое качество', min: 0.05, max: 0.2, note: 'Дешевое или изношенное снаряжение: 5-20% от цены.' },
  { id: 'stolen', label: 'Краденое', min: 0.2, max: 0.5, note: '20-50% от цены, с риском вопросов от скупщика.' },
  { id: 'rare', label: 'Редкость / драгоценности', min: 0.8, max: 1, note: 'Украшения и редкие товары: 80-100% от цены.' },
];

function priceToGp(entry: DmEconomyReferenceItem): number {
  const parsed = parseAnyPrice(entry.price, entry.currency);
  return parsed ? toGp(parsed.amount, parsed.currency) : Number.POSITIVE_INFINITY;
}

function sortedUnique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

function priceLabel(entry: DmEconomyReferenceItem): string {
  const currency = entry.currency ? ` ${entry.currency.toUpperCase()}` : '';
  return `${entry.price}${currency}`;
}

export function EconomyPage() {
  const { data, loading, error } = useCampaignData();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [sort, setSort] = useState<SortMode>('default');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conditionId, setConditionId] = useState(SELL_CONDITIONS[0].id);
  const [sold, setSold] = useState<SoldItem[]>([]);

  const entries = data?.economyReference ?? [];
  const loreEntries = data?.economy ?? [];
  const categories = useMemo(() => sortedUnique(entries.map((entry) => entry.category)), [entries]);
  const availabilities = useMemo(() => sortedUnique(entries.map((entry) => entry.availability)), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    let list = entries;
    if (category !== 'all') list = list.filter((entry) => entry.category === category);
    if (availability !== 'all') list = list.filter((entry) => entry.availability === availability);
    if (q) {
      list = list.filter((entry) =>
        [entry.name, entry.category, entry.availability, entry.quality, entry.source, entry.notes].some((field) =>
          (field ?? '').toLocaleLowerCase('ru-RU').includes(q),
        ),
      );
    }
    if (sort === 'cheapest') return [...list].sort((a, b) => priceToGp(a) - priceToGp(b));
    if (sort === 'rare') return list.filter((entry) => entry.availability && RARE_AVAILABILITY.has(entry.availability));
    return list;
  }, [availability, category, entries, query, sort]);

  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;
  const condition = SELL_CONDITIONS.find((item) => item.id === conditionId) ?? SELL_CONDITIONS[0];
  const sellTotal = sold.reduce((sum, item) => sum + item.qty * item.unitSellGp, 0);

  function addSold(entry: DmEconomyReferenceItem) {
    const parsed = parseAnyPrice(entry.price, entry.currency);
    if (!parsed) return;
    const gp = toGp(parsed.amount, parsed.currency);
    const unitSellGp = gp * ((condition.min + condition.max) / 2);
    setSold((current) => [
      ...current,
      { id: `${entry.id}-${Date.now()}`, name: entry.name, qty: 1, unitSellGp, conditionId: condition.id },
    ]);
  }

  function updateSold(id: string, patch: Partial<SoldItem>) {
    setSold((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function copySellReceipt() {
    const lines = sold.map((item) => {
      const itemCondition = SELL_CONDITIONS.find((conditionItem) => conditionItem.id === item.conditionId);
      return `${item.name} (${itemCondition?.label ?? ''}) x${item.qty} - ${formatGpTotal(item.qty * item.unitSellGp)}`;
    });
    lines.push(`Итого выручка: ${formatGpTotal(sellTotal)}`);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert(text);
    }
  }

  if (loading) return <p className="page">Загрузка экономики...</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;

  return (
    <div className="page economy-page">
      <header className="entity-library-header">
        <div>
          <h1>Экономика</h1>
          <p className="muted">Справочник цен из DM Companion, фильтры и быстрый расчет продажи добычи.</p>
        </div>
      </header>

      <div className="economy-layout">
        <aside className="economy-sidebar">
          <input type="search" placeholder="Поиск товара, цены, заметки..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Все категории</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={availability} onChange={(e) => setAvailability(e.target.value)}>
            <option value="all">Любая доступность</option>
            {availabilities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="entity-filter-chips">
            <button className={sort === 'default' ? 'active' : ''} onClick={() => setSort('default')}>По порядку</button>
            <button className={sort === 'cheapest' ? 'active' : ''} onClick={() => setSort('cheapest')}>Дешевые</button>
            <button className={sort === 'rare' ? 'active' : ''} onClick={() => setSort('rare')}>Редкие</button>
          </div>
          <div className="entity-library-count">{filtered.length} записей</div>
          <ul className="economy-results">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <button className={entry.id === selected?.id ? 'entity-library-row active' : 'entity-library-row'} onClick={() => setSelectedId(entry.id)}>
                  <span className="entity-library-row-main">
                    <strong>{entry.name}</strong>
                    <span>{priceLabel(entry)} · {entry.category}</span>
                    {entry.availability && <small className="placement-badge">{entry.availability}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="economy-detail">
          {selected ? (
            <article className="companion-source-card">
              <div className="companion-source-header">
                <h3>{selected.name}</h3>
                <span className="muted">{selected.category}</span>
              </div>
              <p className="economy-price">{priceLabel(selected)}</p>
              <div className="economy-tags">
                {selected.quality && <span className="companion-tag-chip">{selected.quality}</span>}
                {selected.availability && <span className="companion-tag-chip">{selected.availability}</span>}
                {selected.source && <span className="companion-tag-chip">{selected.source}</span>}
              </div>
              {selected.notes && <p>{selected.notes}</p>}
              <button className="btn-primary" disabled={!parseAnyPrice(selected.price, selected.currency)} onClick={() => addSold(selected)}>
                Добавить в продажу добычи
              </button>
            </article>
          ) : (
            <p className="muted">Ничего не найдено.</p>
          )}

          <article className="companion-source-card">
            <div className="companion-source-header">
              <h3>Продажа добычи</h3>
              <span className="muted">{formatGpTotal(sellTotal)}</span>
            </div>
            <div className="entity-filter-chips">
              {SELL_CONDITIONS.map((item) => (
                <button key={item.id} className={condition.id === item.id ? 'active' : ''} onClick={() => setConditionId(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <p className="muted">{condition.note}</p>
            {sold.length === 0 ? (
              <p className="muted">Добавьте предмет из справочника, чтобы собрать чек продажи.</p>
            ) : (
              <>
                <ul className="companion-item-list">
                  {sold.map((item) => (
                    <li key={item.id} className="economy-sold-row">
                      <span>
                        <strong>{item.name}</strong>
                        <small>{formatGpTotal(item.unitSellGp)} за шт.</small>
                      </span>
                      <input type="number" min={0} value={item.qty} onChange={(e) => updateSold(item.id, { qty: Math.max(0, Number(e.target.value) || 0) })} />
                      <input type="number" min={0} step="0.1" value={Math.round(item.unitSellGp * 100) / 100} onChange={(e) => updateSold(item.id, { unitSellGp: Math.max(0, Number(e.target.value) || 0) })} />
                      <button onClick={() => setSold((current) => current.filter((soldItem) => soldItem.id !== item.id))}>Удалить</button>
                    </li>
                  ))}
                </ul>
                <div className="entity-library-actions">
                  <button className="btn-primary" onClick={copySellReceipt}>Скопировать чек</button>
                  <button onClick={() => setSold([])}>Очистить</button>
                </div>
              </>
            )}
          </article>

          {loreEntries.length > 0 && (
            <article className="companion-source-card">
              <div className="companion-source-header">
                <h3>Лор экономики</h3>
                <span className="muted">{loreEntries.length} заметок</span>
              </div>
              <ul className="companion-item-list">
                {loreEntries.slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.title}</strong>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
