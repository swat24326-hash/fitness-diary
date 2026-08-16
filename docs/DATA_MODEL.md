# Модель данных — IDB, сущности, Postgres

**Актуально:** 2026-08-13. Эталон схемы: `supabase/schema.sql` + идемпотентные `supabase/migrations/`.  
На bare Postgres (C2 / Yandex): сначала `supabase/c2_auth_stub.sql` через `npm run db:migrate:pg` — см. [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).  
Sync-allowlist: [SYNC.md](./SYNC.md). Логика абонементов: `src/lib/membershipRules.js`.

---

## IndexedDB (`fitness-diary`, version **16**)

| Store | keyPath | Заметки |
|-------|---------|---------|
| `meta` | key (string) | Флаги, служебное |
| `clients` | `id` | индексы `club_id`, `trainer_id`; поля ПНК / архив (`archived_at`, `archive_reason`, `archive_reason_at`); `desk_hall` (`tz`\|`az`\|null); `trainer_id` nullable только вместе с desk (`CHECK trainer OR desk_hall`). Lite-ПЗ = обычный клиент с живым тренером, у которого `users.uses_tablet = false` (не desk). |
| `memberships` | `id` | `client_id`, `club_id`; **`hall`** (`pz`\|`tz`\|`az`) — зал абона (один client — несколько залов); опционально `clip_id`; `paid_amount` (₽ **цены покупки** desk/lite — **не** сущность платежа); `session_visits` JSONB — журнал списаний desk АЗ `[{id,date,created_at}]` |
| `trainings` | `id` | `draft` \| `completed`; `data` JSON формы (в т.ч. опционально `hr_session` — сводка пульса BLE, см. [TRAINING_HR.md](./TRAINING_HR.md)) |
| `exercises` | `id` | Справочник |
| `body_measurements` | `id` | обмеры |
| `health_cards` | **`client_id`** | Не путать с `id` строки в Postgres |
| `clubs` | `id` | Кэш клубов |
| `sync_queue` | `local_id` | Очередь push |
| `challenges` | `id` | Челленджи |
| `membership_types` | `id` | Типы карт: **ПЗ** (`trainer_assignable≠false`) и **АЗ** (`trainer_assignable=false`); также БЗ / `is_pnk_trial`. Поле `code` (до 40 символов) — отображаемое название; уникально в клубе без учёта регистра; **переименование** через админ «Типы абон.» не отвязывает абонементы (`membership_type_id`). ПЗ: ставки тренеру `trainer_pay_l1/l2/l3` (₽ за тренировку; `trainer_pay_per_session` = l1 для совместимости ЗП); галочка `counts_toward_pay_plan` — участие в порогах плана ЗП. Менеджер продаж читает все типы своего клуба (RLS `fit_membership_types_sales_manager_read`) |
| `nutrition_products` | `id` | Питание |
| `homework_presets` | `id` | Шаблоны ДЗ |
| `client_weight_entries` | `id` | Вес |
| `outreach_log` | `id` | Касания / Max-очередь (локальный журнал; кэш club SMS) |
| `club_iskra_settings` | `club_id` | Локальный кэш **шаблонов** outreach (`outreach_templates` / SMS-шаблоны). Аккаунт **`moizvonki`** (в т.ч. api_key) живёт в **Postgres**; в API ключ не отдаём (`has_api_key`) — в IDB полный `moizvonki` не кэшируем |
| `pnk_funnel_events` | `id` | Журнал ПНК |
| `sale_clips` | `id` | Клип-карты (awaiting → done на планшете); pull тренеру |

### Postgres only (не stores IndexedDB)

Читаются/пишутся через `admin-data` (и RLS), **без** offline-store в `localDb.js`:

| Таблица | key | Заметки |
|--------|-----|---------|
| `club_coach_quality_settings` | `club_id` | Качество ведения: веса/тумблеры |
| `club_trainer_pay_plan_settings` | `club_id` | План ЗП: пороги тренировок месяца → ур. 1–3 (`config.workouts_l2_min`, `workouts_l3_min`); в пороги идут типы с `counts_toward_pay_plan`; ставки ₽ — на `membership_types` |
| `trainer_pay_profiles` | `trainer_id` | Кабинет ЗП: `on_plan` (без плана → всегда ур. 3) + `rate_adjustment_rub`; клуб в `club_id` |
| `club_trainer_pay_month_snapshots` | `(club_id, year, month)` | Заморозка правил ЗП прошлого календарного месяца; текущий месяц — live |
| `club_sms_log` | — | Облачный журнал SMS клуба (`status` ok\|fail, `error_message`); API `admin-data?action=club-sms` |
| `club_call_log` | — | Журнал звонков: исходящие (`make_call`) + **входящие** (webhook); `direction` outbound\|inbound; `client_id` nullable для неизвестного; исход / запись / пометка; API `club-call` / `moizvonki-webhook` |

Миграции SMS / звонки / moizvonki: `club_sms_templates`, `club_sms_log`, `20260805230000_club_iskra_moizvonki.sql`, `20260813210000_club_sms_log_status.sql`, `20260813220000_club_call_log.sql`, `20260814153000_club_call_log_outcome.sql`, `20260814210000_club_call_log_recording.sql`, `20260815010000_club_call_log_staff_note.sql`, `20260816020000_club_call_log_inbound.sql`.

### Роли `users.role` (Postgres)

| Значение | UI | Не путать |
|----------|-----|-----------|
| `trainer` / `тренер` | Тренер (планшет) | — |
| `sales_manager` / `менеджер по продажам` | Менеджер продаж `/sales` | не «Управляющий» |
| `supervisor` / `управляющий` | Управляющий `/club` | не тренер и не менеджер продаж |
| `admin` / `администратор` | Админ сети | — |

Список staff: `GET /api/list-trainers` без `role` → тренеры; `?role=sales_manager` / `?role=supervisor` — отдельные вкладки Структуры.

Охрана pull: см. [SYNC.md](./SYNC.md).

---

## Основные сущности (логическая)

| Сущность | Смысл |
|----------|--------|
| **clients** | Тренер, клуб, контакты, флаги архива, поля жизненного цикла **ПНК** |
| **memberships** | Период, лимит тренировок, тип карты, **`hall`** (pz/tz/az); опционально `paid_amount` (**цена** пакета на desk/lite, не ledger оплаты); desk АЗ — `used_trainings` + `session_visits`; у ПЗ списание при завершении тренировки; удаление с карточки только без связанных тренировок. Канон: [CLIENT_MULTI_HALL.md](./CLIENT_MULTI_HALL.md) |
| **trainings** | Дата, тип, статус, JSON `data` из `TrainingForm` (упражнения, вес, опционально снимок `hr_session`) |
| **health_cards** | Рост, вес, цель (`goal`), тексты медкарты |
| **body_measurements** | Поля из `BODY_MEASURE_FIELDS` (+ legacy-имена в читалке) |
| **Продажи** | Daily / plan / finance в Postgres; UI `/sales`, `/admin/sales` — через API, не IDB-очередь. `club_sales_plan.strategy_snapshot` (jsonb) — снимок playbook Стратегии |
| **Оплаты (платёж)** | 📋 ТЗ — отдельная сущность ledger ещё **нет**; сейчас деньги дня = агрегаты `club_sales_daily` + мост Excel. Канон и фазы: [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md). **Следующий L3** после правды платежа — касса **на клуб** (как `moizvonki`). |
| **ИСКРА** | Settings, learning, dispatch — сервер + частичный кэш settings |
| **Архив** | Правила UI/sync/agg — [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) |

Детали ПНК: [PNK_FUNNEL.md](./PNK_FUNNEL.md), код `src/lib/pnk/`, миграции `db:migrate:pnk`.

---

## Postgres

- Новый проект / bare PG (C2): `npm run db:migrate:pg` → stub `c2_auth_stub.sql` → `schema.sql` → `migrations/` (порядок по имени). `policies.sql` — только с `--with-policies`.
- Прод Supabase: `schema.sql`, затем актуальные `migrations/` (порядок по имени файла) через привычные `db:migrate:*` / CLI.
- Существующий прод: только миграции / скрипты `npm run db:migrate*`.
- RLS: `policies.sql` + миграции политик; чеклист — [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).
- `public.users.id` **=** Auth UID.
- `public.users.role` — `admin` | `trainer` | `sales_manager` | `supervisor` (+ кириллические синонимы); см. таблицу ролей выше.
- `public.users.uses_tablet` — тренер с планшетом (`true`, default) или без (`false` → lite-ПЗ клиентов ведёт админ). Миграция `db:migrate:users-uses-tablet`. См. [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md).
- `club_iskra_settings.moizvonki` — jsonb аккаунта Мои Звонки на клуб (не в IDB-смысле секрета для клиента).
- Прайс ПЗ: `club_price_lists` (один JSON-документ на `club_id`) — [PRICE_LIST.md](./PRICE_LIST.md).
- Прайс ТЗ: `club_tz_price_lists` — [PRICE_LIST.md](./PRICE_LIST.md).
- Прайс АЗ: `club_az_price_lists` — [PRICE_LIST.md](./PRICE_LIST.md).

Объём и пороги pull: [DATA_VOLUME.md](./DATA_VOLUME.md).

---

## Паритет agg

Клиент: `src/lib/admin/*Agg.js`.  
Сервер: `api/_lib/*Agg.js`.  
При изменении одного — второе + `scripts/verify-*.mjs` (см. [TESTING.md](./TESTING.md)).
