# Модель данных — IDB, сущности, Postgres

**Актуально:** 2026-07-17. Эталон схемы: `supabase/schema.sql` + идемпотентные `supabase/migrations/`.  
Sync-allowlist: [SYNC.md](./SYNC.md). Логика абонементов: `src/lib/membershipRules.js`.

---

## IndexedDB (`fitness-diary`, version **14**)

| Store | keyPath | Заметки |
|-------|---------|---------|
| `meta` | key (string) | Флаги, служебное |
| `clients` | `id` | индексы `club_id`, `trainer_id`; поля ПНК / архив |
| `memberships` | `id` | `client_id`, `club_id`; «активность» — в коде, не слепо по `status` |
| `trainings` | `id` | `draft` \| `completed`; `data` JSON формы |
| `exercises` | `id` | Справочник |
| `body_measurements` | `id` | обмеры |
| `health_cards` | **`client_id`** | Не путать с `id` строки в Postgres |
| `clubs` | `id` | Кэш клубов |
| `sync_queue` | `local_id` | Очередь push |
| `challenges` | `id` | Челленджи |
| `membership_types` | `id` | Типы карт (в т.ч. БЗ / `is_pnk_trial`) |
| `nutrition_products` | `id` | Питание |
| `homework_presets` | `id` | Шаблоны ДЗ |
| `client_weight_entries` | `id` | Вес |
| `outreach_log` | `id` | Касания / Max-очередь (локальный журнал; кэш club SMS) |
| `club_iskra_settings` | `club_id` | Настройки ИСКРЫ на клуб (`outreach_templates` — Max тренера; `club_sms_templates` — SMS клуба) |

Postgres (не IDB): **`club_sms_log`** — облачный журнал SMS клуба (кто / кому / сценарий / превью); API `admin-data?action=club-sms`.

Охрана pull: см. [SYNC.md](./SYNC.md).

---

## Основные сущности (логическая)

| Сущность | Смысл |
|----------|--------|
| **clients** | Тренер, клуб, контакты, флаги архива, поля жизненного цикла **ПНК** |
| **memberships** | Период, лимит тренировок, тип карты; списание при завершении тренировки; удаление с карточки клиента (`deleteLocalWithSync`, confirm в `MembershipManager`) |
| **trainings** | Дата, тип, статус, JSON `data` из `TrainingForm` |
| **health_cards** | Рост, вес, цель (`goal`), тексты медкарты |
| **body_measurements** | Поля из `BODY_MEASURE_FIELDS` (+ legacy-имена в читалке) |
| **Продажи** | Daily / plan / finance в Postgres; UI `/sales`, `/admin/sales` — через API, не IDB-очередь |
| **ИСКРА** | Settings, learning, dispatch — сервер + частичный кэш settings |
| **Архив** | Правила UI/sync/agg — [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) |

Детали ПНК: [PNK_FUNNEL.md](./PNK_FUNNEL.md), код `src/lib/pnk/`, миграции `db:migrate:pnk`.

---

## Postgres

- Новый проект: `schema.sql`, затем актуальные `migrations/` (порядок по имени файла).
- Существующий прод: только миграции / скрипты `npm run db:migrate*`.
- RLS: `policies.sql` + миграции политик; чеклист — [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).
- `public.users.id` **=** Auth UID.

Объём и пороги pull: [DATA_VOLUME.md](./DATA_VOLUME.md).

---

## Паритет agg

Клиент: `src/lib/admin/*Agg.js`.  
Сервер: `api/_lib/*Agg.js`.  
При изменении одного — второе + `scripts/verify-*.mjs` (см. [TESTING.md](./TESTING.md)).
