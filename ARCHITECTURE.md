# Архітектура

## Шари (суворе розділення відповідальності)

```
UI (React)                       pages/, components/, features/*/**.tsx
  │  читає через live-hooks, пише лише через репозиторії
Hooks                            hooks/useDb.ts (dexie-react-hooks), useFormat.ts
  │
Сервісний шар                    db/service.ts  (агрегації, закриття місяця)
Репозиторії                      db/repositories.ts  (єдина точка мутацій)
  │
Доменна логіка (чисті функції)   domain/calculations/*  domain/money.ts
База даних (IndexedDB)           db/db.ts (Dexie), db/seed.ts
Валідація                        domain/validation.ts (Zod)
i18n                             i18n/*
```

**Правило:** UI ніколи не звертається до Dexie для запису напряму — лише через
`repositories.ts` / `service.ts`. Це гарантує коректність журналу операцій,
аудиту та відсутність подвійного обліку. Доменні розрахунки не знають про БД.

## Готовність до серверної синхронізації

Модель спроєктована так, щоб додати сервер **без переписування домену**:

- Кожна сутність має стабільний `id` (UUID v4), `createdAt`, `updatedAt`,
  `deletedAt` (м’яке видалення) — база для майбутнього sync/CRDT.
- Операції immutable-подібні: замість зміни суми створюються `refund` /
  `correction`, пов’язані через `relatedTransactionId`.
- `auditLog` фіксує всі значущі дії.
- Немає прив’язки домену до Dexie: розрахунки — чисті функції над масивами.

Наразі сервера немає (за вимогою етапу 1).

## Потік даних (приклад: додати витрату)

1. `ExpenseSheet` → `repositories.addExpense()` → `db.transactions.add()` + аудит.
2. `useLiveQuery` (у `useMonthView`) фіксує зміну таблиці `transactions`.
3. `loadMonthView()` перечитує дані й викликає `computeMonthTotals` +
   `computeCategoryState` (чисті функції).
4. `Home` / `Budget` перемальовуються з новими залишками.
5. Тост із дією «Скасувати» → `softDeleteTransaction()`.

## Стан і зберігання

- **IndexedDB (Dexie)** — усі фінансові дані (див. `DATA_MODEL.md`).
- **LocalStorage** — лише легкі налаштування UI зберігаються через таблицю
  `settings` (тема, локаль, `lastMonthKey`, приховування сум, стан підказок).
  У поточній версії налаштування теж у Dexie для консистентності; ключ
  `lastMonthKey` виконує роль «останнього відкритого місяця».

## PWA

- `vite-plugin-pwa` (Workbox, `generateSW`, `registerType: autoUpdate`).
- Precache статичних ассетів, `navigateFallback: /index.html` для офлайну.
- `manifest`: standalone, portrait, теми, іконки 192/512 + maskable.

## Теми та адаптивність

- CSS-змінні у `:root`; темна тема через `prefers-color-scheme` **і** явний
  `data-theme` (перемикач у налаштуваннях перекриває системну).
- `safe-area-inset-*`, `viewport-fit=cover`, мін. висота натискань 44px,
  без горизонтального скролу, фіксована нижня навігація з FAB «+ Витрата».
