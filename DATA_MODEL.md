# Модель даних (IndexedDB / Dexie v1)

БД `budget-db`, схема версіонована через `db.version(n).stores(...)`. Оновлення
застосунку **не очищає** дані. Усі суми — цілі копійки.

## Таблиці та індекси

| Таблиця                | Первинний ключ | Індекси |
|------------------------|----------------|---------|
| `settings`             | `id` (='app')  | — |
| `categories`           | `id`           | `section, priority, active, sortOrder` |
| `monthlyBudgets`       | `id`           | `&monthKey, status, createdAt` |
| `monthlyCategoryPlans` | `id`           | `monthId, categoryId, [monthId+categoryId]` |
| `transactions`         | `id`           | `monthId, categoryId, type, date, createdAt, [monthId+type], [monthId+categoryId]` |
| `transfers`            | `id`           | `monthId, destinationCategoryId, date, createdAt` |
| `reserves`             | `id`           | `kind, active, sortOrder` |
| `savingsGoals`         | `id`           | `status, sortOrder` |
| `monthlyClosures`      | `id`           | `monthId, closedAt` |
| `recommendations`      | `id`           | `monthId, categoryId` |
| `auditLog`             | `id`           | `entity, entityId, action, createdAt` |

> Примітка: операції з резервами та накопиченнями зберігаються у `transactions`
> з типами `reserve_*` / `savings_*` (єдиний журнал). Під час експорту вони
> додатково розкладаються у поля `reserveTransactions` / `savingsTransactions`
> для читабельності, як того вимагає ТЗ; таблиці `reserveTransactions` та
> `savingsTransactions` логічно є проєкціями `transactions`.

## Базові поля кожної сутності

`id: string` · `createdAt: ISO` · `updatedAt: ISO` · `deletedAt?: ISO|null`
(м’яке видалення).

## Ключові сутності

### Category
`name, emoji, section, priority(1..6), kind('spending'|'reserve'|'savings'),
minAmount, desiredAmount, regular, rollover, active, sortOrder, notes`.

### MonthlyBudget
`monthKey('YYYY-MM'), title, status('draft'|'active'|'closed'), expectedIncome,
openedAt, closedAt, reopenCount`.

### MonthlyCategoryPlan
`monthId, categoryId, planned, suggested, priorityOverride, criticalOverride,
disabled, rolloverIn, note`.

### Transaction
`monthId, type, amount(≥0), date, categoryId?, sourceCategoryId?,
destinationCategoryId?, reserveId?, savingsGoalId?, note?, paymentMethod?,
relatedTransactionId?`.
Типи: `income, expense, category_transfer, reserve_deposit, reserve_withdrawal,
savings_deposit, savings_withdrawal, refund, correction`.

### Transfer
`monthId, amount, date, sourceType('unallocated'|'category'|'reserve'|'savings'),
source*Id, destinationCategoryId, reason, initiator, sourceBalanceBefore,
sourceBalanceAfter, transactionId`.

### Reserve
`name, emoji, kind, balance, active, sortOrder, note`.

### SavingsGoal
`name, emoji, currentAmount, targetAmount, monthlyContribution, targetDate,
status('active'|'reached'|'paused'), sortOrder, note`.

### MonthlyClosure
`monthId, closedAt, summary(ClosureSummary — знімок підсумків)`.

## Міграційна стратегія

Нові версії додаються як `db.version(2).stores({...}).upgrade(tx => ...)`.
Дані не видаляються. `settings.schemaVersion` зберігає версію для майбутніх
міграцій даних. `ensureSeeded()` ідемпотентно створює налаштування та стартовий
шаблон лише коли таблиці порожні.

## Формат резервної копії (`budget-backup-*.json`)

`{ formatVersion, exportedAt, appVersion, data: { ...усі таблиці } }` —
перевіряється Zod-схемою `backupSchema` при імпорті.
