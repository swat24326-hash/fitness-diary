# Удержание и жизнь клиента

**Статус:** ✅ фаза 0 · ✅ фаза 1 · ✅ фаза 2 (restore journal, tenure universe, anchor trainer из дневника) · backlog: offline-кэш retention  
**Кому:** управляющий (клуб), тренер с планшетом (свои KPI)  
**Не путать с:** [COACH_QUALITY.md](./COACH_QUALITY.md), воронкой чипов (`trainerClientOutreachCore.js`), period census (`clubClientPeriodAgg.js`)

## Зачем

CRM-правда: сколько клиент живёт, почему ушёл в архив, вернулся ли и остался ли. Сейчас — **поведенческий** retention (тренировки + абоны). Рублёвый LTV / NRR — после домена оплат (R3+, см. [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md)).

## Три сигнала (не смешивать)

| Сигнал | Условие | KPI |
|--------|---------|-----|
| **Hard churn ПЗ** | закрытие `hall=pz` в периоде (`client_hall_lifecycle`) | PZ churn, reason mix |
| **Hard churn клуба** | `archived_at` в периоде | Archive rate клуба |
| **Переход** | закрытие ПЗ при живом ТЗ/АЗ (`to_tz` / `to_az`) | Не отток клуба; см. [CLIENT_HALL_LIFECYCLE.md](./CLIENT_HALL_LIFECYCLE.md) |
| **Soft churn** | `isTrainerClientInactiveToday` (>60 дн. или странный абон) | Leading (не в top-6 MVP) |
| **Engagement** | ≥1 `completed` в календарном месяце | Retention M+3 |

Coach Quality (0–7 / 8–14 / >14) — **отдельный** leading indicator, не retention.

## Пул retention (R-RET)

`filterHallOperationalClients` логика через `isClientInRetentionPool`:

- не архив, не desk ТЗ/АЗ, не holding, не lite-ПЗ (`uses_tablet=false`);
- не open `lifecycle=pnk`;
- **не закрытый ПЗ** (`client_hall_lifecycle.closed_at` для `hall=pz`) — иначе переход в ТЗ/АЗ раздувает M+3 пул.

Архив клуба после закрытия ПЗ **остаётся** в universe (для archive rate).

API `client-retention` подтягивает `client_hall_lifecycle` → KPI **Закрытия ПЗ** (`pzChurnRate` / переходы).

**Когорты M+3** строятся по **universe** (включая уже архивных tablet-клиентов), чтобы не было survivorship bias.

## Определения

| Термин | Правило |
|--------|---------|
| **Cohort anchor** | Первый paid ДК (`start_date`), не БЗ; fallback `pnk_won_at` |
| **Engaged в месяце M** | ≥1 completed в календарном M (даже если позже архив) |
| **Retention M+3** | \|cohort(T) ∩ engaged(T+3)\| / \|cohort(T)\|, только **зрелые** когорты; взвешенное по клиентам |
| **Renewal eligible** | paid абон end в [asOf−14, asOf], не `isClientExcludedFromRenewals` |
| **Renewed** | следующий paid в [end, end+14] **или** overlap (start &gt; start истекающего, start ≤ end+14) |
| **Restore** | `archived_at`: было → null |
| **Successful reactivation** | restore + completed в 30 дн. |
| **Trainer attribution** | `trainer_id` первой completed в месяце anchor; иначе первая completed ≥ anchor; иначе текущий `trainer_id` |

История **не пересчитывается** при архиве — см. [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md).

## MVP KPI (6)

1. Retention M+3 (когорты до 6 мес.)
2. Renewal rate (окно 14 дн.)
3. Archive rate (квартал / период)
4. Archive reason mix
5. Reactivation rate = successful / restores (90 дн. lookback; нужен список restore-событий)
6. Trainer retention M+3 (tablet, R-RET) + **медиана жизни по тренеру** (attribution = anchorTrainerId, все клиенты universe)

## Код

| Файл | Роль |
|------|------|
| `src/lib/admin/clientRetentionPoolCore.js` | R-RET пул |
| `src/lib/admin/clientRetentionCore.js` | engaged, churn, renewal, reactivation, tenure |
| `src/lib/admin/clientRetentionCohortCore.js` | когорты M+N |
| `src/lib/admin/clientRetentionArchiveReasonCore.js` | mix причин |
| `src/lib/admin/clientRetentionAgg.js` | club + byTrainer |
| `scripts/verify-client-retention.mjs` | verify |

API (фаза 1): `admin-data?action=client-retention&club_id=&date_from=&date_to=&trainer_id=` (опц.)

## UI (фаза 1)

| Экран | Что видно |
|-------|-----------|
| **Админ → Статистика → вкладка ПЗ** | Карточка «Удержание» (M+3) → drill-down: KPI, причины архива, таблица по тренерам (M+3 + медиана жизни) |
| **Тренер → Профиль → Статистика** | Тот же блок через `AdminClubStatsSection` — только свои KPI |

Reactivation: журнал `client_restore_events` (миграция `20260820120000_client_restore_events.sql`); пишется при push «Вернуть»; KPI lookback 90 дн.

## Журнал restore (фаза 2)

| Компонент | Путь |
|-----------|------|
| Таблица | `client_restore_events` |
| Push | `api/_lib/clientRestoreEventWrite.js` → `pushRecordCore` |
| Read | `api/_lib/clientRestoreEventsQuery.js` → `clubClientRetentionCore` |
| Core | `src/lib/admin/clientRestoreEventCore.js` |
| Verify | `scripts/verify-client-restore-event.mjs` |

**Tenure (медиана жизни):** считается по **universe** (включая архивных tablet-клиентов).

## Проверка

```bash
node scripts/verify-client-retention.mjs
```

Входит в `npm run qa:local` через `agent-qa.mjs`.

## Не в MVP

LTV/NRR ₽, единый рейтинг тренера, ЗП, смешение с Coach Quality.
