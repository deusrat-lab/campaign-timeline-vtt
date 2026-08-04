# FINANCIAL_AUDIT — незалежний аудит формул

Дата: 2026-08-04. Аудит підкріплено автоматичними тестами
(`src/tests/balances.test.ts`, `financial-invariants.test.ts`, `integration.test.ts`).

## Перевірені сценарії

| Сценарій | Де перевірено | Статус |
|----------|---------------|--------|
| Дохід частинами (сума income) | balances, integration | ✅ |
| Очікуваний vs фактичний дохід | модель (`expectedIncome` ≠ Σ income) | ✅ |
| Розподілений vs нерозподілений | `unallocated` формула | ✅ |
| Факт витрат (expense+correction−refund) | balances, invariants | ✅ |
| Перекази між категоріями | invariants (не змінюють залишок) | ✅ |
| Резерв (поповнення/зняття) | integration | ✅ |
| Накопичення (поповнення/зняття) | invariants | ✅ |
| Зняття не створює зовнішній дохід | invariants | ✅ |
| Повернення не створює дохід | invariants | ✅ |
| Коригування | balances (враховано у факті) | ✅ |
| Повторне відкриття місяця | repositories (reopen + audit) | ✅ (unit-рівень) |
| Імпорт / merge / soft delete | backup + validation | ✅ (unit-рівень) |
| Відсутність подвійного обліку | invariants | ✅ |
| Цілі копійки завжди | invariants (Number.isInteger) | ✅ |

## Ключові інваріанти (property-based, 300 випадкових сценаріїв)

Файл `financial-invariants.test.ts` генерує детерміновані випадкові послідовності
операцій і перевіряє щоразу:

1. **Усі підсумки — цілі копійки** (`Number.isInteger`).
2. **Грошовий залишок узгоджений**:
   `actualCashBalance = income − expense − (savings_in − savings_out) − (reserve_in − reserve_out)`.
3. **Перенос між категоріями не змінює грошовий залишок** (`computeMonthTotals`
   не залежить від `transfers`).
4. **Перенос лише перерозподіляє ліміти**: `transfersIn` призначення = сумі,
   `transfersOut` джерела = сумі (гроші не створюються й не зникають).

Окремі інваріанти:

- **Повернення** зменшує факт категорії й `totalExpense`, але **не** збільшує
  `actualIncome`.
- **Поповнення накопичень** не входить у `totalExpense` (не споживча витрата),
  але зменшує грошовий залишок.
- **Зняття з резерву** не збільшує `actualIncome`; повертає гроші в обіг
  (чисті резерви зменшуються → залишок зростає).

## Формули (стисло)

```
actualIncome      = Σ income
totalExpense      = Σ expense + Σ correction − Σ refund
unallocated       = actualIncome − Σ planned(active) − Σ reserve_deposit − Σ savings_deposit
actualCashBalance = actualIncome − totalExpense
                    − (Σ savings_deposit − Σ savings_withdrawal)
                    − (Σ reserve_deposit − Σ reserve_withdrawal)
categoryLimit     = planned + rolloverIn + transfersIn − transfersOut
categoryAvailable = categoryLimit − categoryActual
savingsRateBps    = round(toSavings / actualIncome × 10000)
```

Деталі та захист критичних категорій — у `FINANCIAL_RULES.md`.

## Висновок

Модель не створює й не втрачає гроші без операції; переноси не подвоюють облік;
уся арифметика — в цілих копійках. Інваріанти зафіксовано автоматичними тестами,
що виконуються в CI.
