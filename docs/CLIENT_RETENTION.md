# Удержание и жизнь клиента

**Статус:** ✅ фаза 0 (core + verify) · ✅ фаза 1 (API + карточка в Статистике ПЗ) · фаза 2 — журнал restore, tenure на universe  
**Кому:** управляющий (клуб), тренер с планшетом (свои KPI)  
**Не путать с:** [COACH_QUALITY.md](./COACH_QUALITY.md), воронкой чипов (`trainerClientOutreachCore.js`), period census (`clubClientPeriodAgg.js`)

## Зачем

CRM-правда: сколько клиент живёт, почему ушёл в архив, вернулся ли и остался ли. Сейчас — **поведенческий** retention (тренировки + абоны). Рублёвый LTV / NRR — после домена оплат (R3+, см. [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md)).

## Три сигнала (не смешивать)

| Сигнал | Условие | KPI |
|--------|---------|-----|
| **Hard churn** | `archived_at` в периоде | Archive rate, reason mix |
| **Soft churn** | `isTrainerClientInactiveToday` (>60 дн. или странный абон) | Leading (не в top-6 MVP) |
| **Engagement** | ≥1 `completed` в календарном месяце | Retention M+3 |

Coach Quality (0–7 / 8–14 / >14) — **отдельный** leading indicator, не retention.

## Пул retention (R-RET)

`filterHallOperationalClients` логика через `isClientInRetentionPool`:

- не архив, не desk ТЗ/АЗ, не holding, не lite-ПЗ (`uses_tablet=false`);
- не open `lifecycle=pnk`.

Lite-ПЗ: в commercial / renewal, **вне** R-RET.

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
| **Trainer attribution** | `trainer_id` на cohort anchor (фиксируется в `CohortMember.anchorTrainerId`) |

История **не пересчитывается** при архиве — см. [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md).

## MVP KPI (6)

1. Retention M+3 (когорты до 6 мес.)
2. Renewal rate (окно 14 дн.)
3. Archive rate (квартал / период)
4. Archive reason mix
5. Reactivation rate = successful / restores (90 дн. lookback; нужен список restore-событий)
6. Trainer retention M+3 (tablet, R-RET)

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
| **Админ → Статистика → вкладка ПЗ** | Карточка «Удержание» (M+3) → drill-down: KPI, причины архива, M+3 по тренерам |
| **Тренер → Профиль → Статистика** | Тот же блок через `AdminClubStatsSection` — только свои KPI |

Reactivation в UI показывает «—», пока нет журнала restore (фаза 2).

## Проверка

```bash
node scripts/verify-client-retention.mjs
```

Входит в `npm run qa:local` через `agent-qa.mjs`.

## Не в MVP

LTV/NRR ₽, единый рейтинг тренера, ЗП, смешение с Coach Quality.
