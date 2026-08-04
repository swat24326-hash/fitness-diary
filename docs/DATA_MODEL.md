# Модель данных — IDB, сущности, Postgres

**Актуально:** 2026-08-03. Эталон схемы: `supabase/schema.sql` + идемпотентные `supabase/migrations/`.  
Sync-allowlist: [SYNC.md](./SYNC.md). Логика абонементов: `src/lib/membershipRules.js`.

---

## IndexedDB (`fitness-diary`, version **16**)

| Store | keyPath | Заметки |
|-------|---------|---------|
| `meta` | key (string) | Флаги, служебное |
| `clients` | `id` | индексы `club_id`, `trainer_id`; поля ПНК / архив; `desk_hall` (`tz`\|`az`\|null); `trainer_id` nullable только вместе с desk (`CHECK trainer OR desk_hall`). Lite-ПЗ = обычный клиент с живым тренером, у которого `users.uses_tablet = false` (не desk). |
| `memberships` | `id` | `client_id`, `club_id`; опционально `clip_id`; `paid_amount` (₽ покупки, desk ТЗ/АЗ) |
| `trainings` | `id` | `draft` \| `completed`; `data` JSON формы (в т.ч. опционально `hr_session` — сводка пульса BLE, см. [TRAINING_HR.md](./TRAINING_HR.md)) |
| `exercises` | `id` | Справочник |
| `body_measurements` | `id` | обмеры |
| `health_cards` | **`client_id`** | Не путать с `id` строки в Postgres |
| `clubs` | `id` | Кэш клубов |
| `sync_queue` | `local_id` | Очередь push |
| `challenges` | `id` | Челленджи |
| `membership_types` | `id` | Типы карт: **ПЗ** (`trainer_assignable≠false`) и **АЗ** (`trainer_assignable=false`); также БЗ / `is_pnk_trial`. Менеджер продаж читает все типы своего клуба (RLS `fit_membership_types_sales_manager_read`) |
| `nutrition_products` | `id` | Питание |
| `homework_presets` | `id` | Шаблоны ДЗ |
| `client_weight_entries` | `id` | Вес |
| `outreach_log` | `id` | Касания / Max-очередь (локальный журнал; кэш club SMS) |
| `club_iskra_settings` | `club_id` | Настройки ИСКРЫ на клуб (`outreach_templates` — Max тренера; `club_sms_templates` — SMS клуба) |
| `pnk_funnel_events` | `id` | Журнал ПНК |
| `sale_clips` | `id` | Клип-карты (awaiting → done на планшете); pull тренеру |

Postgres (не IDB): **`club_sms_log`** — облачный журнал SMS клуба (кто / кому / сценарий / превью); API `admin-data?action=club-sms`.

Охрана pull: см. [SYNC.md](./SYNC.md).

---

## Основные сущности (логическая)

| Сущность | Смысл |
|----------|--------|
| **clients** | Тренер, клуб, контакты, флаги архива, поля жизненного цикла **ПНК** |
| **memberships** | Период, лимит тренировок, тип карты, опционально `paid_amount` (учёт цены на desk ТЗ/АЗ); списание при завершении тренировки; удаление с карточки клиента только без связанных тренировок (иначе — сначала удалить их в списке абонемента) |
| **trainings** | Дата, тип, статус, JSON `data` из `TrainingForm` (упражнения, вес, опционально снимок `hr_session`) |
| **health_cards** | Рост, вес, цель (`goal`), тексты медкарты |
| **body_measurements** | Поля из `BODY_MEASURE_FIELDS` (+ legacy-имена в читалке) |
| **Продажи** | Daily / plan / finance в Postgres; UI `/sales`, `/admin/sales` — через API, не IDB-очередь. `club_sales_plan.strategy_snapshot` (jsonb) — снимок playbook Стратегии (закрытия + галочки) на все устройства; миграция `20260803120000_club_sales_plan_strategy_snapshot.sql` |
| **ИСКРА** | Settings, learning, dispatch — сервер + частичный кэш settings |
| **Архив** | Правила UI/sync/agg — [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) |

Детали ПНК: [PNK_FUNNEL.md](./PNK_FUNNEL.md), код `src/lib/pnk/`, миграции `db:migrate:pnk`.

---

## Postgres

- Новый проект: `schema.sql`, затем актуальные `migrations/` (порядок по имени файла).
- Существующий прод: только миграции / скрипты `npm run db:migrate*`.
- RLS: `policies.sql` + миграции политик; чеклист — [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).
- `public.users.id` **=** Auth UID.
- `public.users.uses_tablet` — тренер с планшетом (`true`, default) или без (`false` → lite-ПЗ клиентов ведёт админ). Миграция `db:migrate:users-uses-tablet`. См. [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md).
- Прайс ПЗ: `club_price_lists` (один JSON-документ на `club_id`) — [PRICE_LIST.md](./PRICE_LIST.md).
- Прайс ТЗ: `club_tz_price_lists` — [PRICE_LIST.md](./PRICE_LIST.md).
- Прайс АЗ: `club_az_price_lists` — [PRICE_LIST.md](./PRICE_LIST.md).

Объём и пороги pull: [DATA_VOLUME.md](./DATA_VOLUME.md).

---

## Паритет agg

Клиент: `src/lib/admin/*Agg.js`.  
Сервер: `api/_lib/*Agg.js`.  
При изменении одного — второе + `scripts/verify-*.mjs` (см. [TESTING.md](./TESTING.md)).
