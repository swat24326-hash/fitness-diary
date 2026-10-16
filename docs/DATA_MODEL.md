# Модель данных — IDB, сущности, Postgres

**Актуально:** 2026-08-20. Эталон схемы: `supabase/schema.sql` + идемпотентные `supabase/migrations/`.  
На bare Postgres (C2 / Yandex): сначала `supabase/c2_auth_stub.sql` через `npm run db:migrate:pg` — см. [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).  
Sync-allowlist: [SYNC.md](./SYNC.md). Логика абонементов: `src/lib/membershipRules.js`.

---

## IndexedDB (`fitness-diary`, version **21**)

| Store | keyPath | Заметки |
|-------|---------|---------|
| `meta` | key (string) | Флаги, служебное |
| `clients` | `id` | индексы `club_id`, `trainer_id`; `trainer_chat_since` — с какой метки новый тренер видит диалог «Тренер» ([CHAT.md](./CHAT.md)); поля ПНК / **архив клуба** (`archived_at`…); `desk_hall`; закрытие направления — `client_hall_lifecycle` ([CLIENT_HALL_LIFECYCLE.md](./CLIENT_HALL_LIFECYCLE.md)). Lite-ПЗ = тренер с `uses_tablet=false`. |
| `memberships` | `id` | `client_id`, `club_id`; **`hall`** (`pz`\|`tz`\|`az`) — зал абона (один client — несколько залов); опционально `clip_id`; `paid_amount` (₽ **цены покупки** desk/lite — **не** сущность платежа); `session_visits` JSONB — журнал списаний desk АЗ `[{id,date,created_at}]` |
| `trainings` | `id` | `draft` \| `completed`; `data` JSON формы (упражнения: `format` 1–3, опционально `laterality: 'lr'` — левая/правая в одном подходе; опционально `hr_session` — сводка пульса BLE, см. [TRAINING_HR.md](./TRAINING_HR.md)) |
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
| `sale_clips` | `id` | Клип-карты (awaiting → done на планшете); pull тренеру. Удаление клиента: awaiting снимается, `client_id` не пишется обратно |
| `client_hall_lifecycle` | `id` | Закрытие ПЗ/ТЗ/АЗ (`hall`, `closed_at`, `close_reason`); индексы `client_id`, `club_id` |
| `trainer_schedule_entries` | `id` | Ежедневник тренера: день, время, заметка и/или `client_ids[]`, категория `kind` (цвет); индексы `trainer_id`, `[trainer_id, day_date]` — см. [TRAINER_SCHEDULE.md](./TRAINER_SCHEDULE.md) |
| `loyalty_glance` | `client_id` | Кэш снимка баллов (GET `loyalty-glance`, не sync_queue) |
| `client_plans` | `id` | С v20. Отправленные клиенту «В приложение» задание (`kind: homework`) и рацион (`nutrition`): локально — новая запись с `payload` до push; из `trainer-pull` — только отметки (`sent_at`, `client_seen_at`, без `payload`, 45 дней). Индекс `by_client_id`. Postgres: `client_plans` (`payload` — снимок по белому списку `clientPlanCore.js`, `summary`, `sent_by`, `client_seen_at`, `notified_at`), RLS без политик, миграция `20261017120000_client_plans.sql`, [CLIENT_APP.md](./CLIENT_APP.md) § «ДЗ и питание от тренера». Ленты `/me/notifications` и `/trainer/notifications` в фазе 1 читают ту же сущность (виртуально); отдельной таблицы `client_notifications` пока нет |
| `homework_auto` | `id` | С v21. Настройки авто-ДЗ клиента: `enabled`, цель, уровень, `avoid`, число занятий, пол, `limits_ok` (тренер подтвердил «ограничений нет»), `anchor_date` (воскресенье недели 1 блока), `block_shift` («другой набор»), `skip_date`. Одна строка на клиента, `id` = `homeworkAutoRowId(client_id)`. Индекс `by_client_id`. Postgres: `homework_auto` (UNIQUE `client_id`), RLS без политик, миграция `20261023120000_homework_auto.sql`. Воскресные задания пишет cron в `client_plans` с постоянным `id` от клиента и даты — [HOMEWORK_AUTO.md](./HOMEWORK_AUTO.md) |
| `health_screenings` | `id` | С v22. Анкета здоровья клиента: `answers` (JSONB: `clearance`, `zones`, `bones`, `women`, `life`, `cleared` — кто и когда подтвердил допуск и для какого набора меток), `updated_by`. Одна строка на клиента, `id` = `healthScreeningRowId(client_id)`. Индекс `by_client_id`, удаляется вместе с клиентом. Postgres: `health_screenings` (UNIQUE `client_id`), RLS без политик, миграция `20261024120000_health_screenings.sql` — [HEALTH_SCREENING.md](./HEALTH_SCREENING.md) |
| `homework_library` | `id` | С v23. Правки библиотеки ДЗ админом, одна на сеть: `entry` (JSONB — упражнение), `is_active`, `updated_by`. id встроенного = правка, `c_xxxxxxxx` = своё, `is_active = false` = убрано из подбора. Postgres: `homework_library`, RLS без политик, миграция `20261025120000_homework_library.sql` — [HOMEWORK_AUTO.md](./HOMEWORK_AUTO.md) |

### Postgres only (не stores IndexedDB)

Читаются/пишутся через `admin-data` (и RLS), **без** offline-store в `localDb.js`:

| Таблица | key | Заметки |
|--------|-----|---------|
| `club_coach_quality_settings` | `club_id` | Качество ведения: веса/тумблеры |
| `club_trainer_pay_plan_settings` | `club_id` | План ЗП: пороги тренировок месяца → ур. 1–3 (`config.workouts_l2_min`, `workouts_l3_min`); в пороги идут типы с `counts_toward_pay_plan`; ставки ₽ — на `membership_types` |
| `trainer_pay_profiles` | `trainer_id` | Кабинет ЗП: `on_plan` (без плана → всегда ур. 3) + `rate_adjustment_rub`; клуб в `club_id` |
| `club_trainer_pay_month_snapshots` | `(club_id, year, month)` | Заморозка правил ЗП прошлого календарного месяца; текущий месяц — live |
| `club_sms_log` | — | Облачный журнал SMS клуба (`status` ok\|fail, `error_message`); API `admin-data?action=club-sms` |
| `club_call_log` | — | Журнал звонков: исходящие (`make_call`) + **входящие** (webhook); `direction` outbound\|inbound; `client_id` nullable для неизвестного; исход / запись / пометка; `staff_note_chip_id` + `callback_on` (воронка следующего шага); API `club-call` / `moizvonki-webhook` |
| `club_loyalty_settings` | `club_id` | Лояльность ПЗ: ставки и интервалы; RLS без политик anon — только API |
| `loyalty_ledger` | `id` | Якоря redeem / архив / переезд / cycle_open; не в push allowlist |
| `auth_sessions` | `id` (= `sid` в JWT) | Сессии своего входа (`AUTH_PROVIDER=own`): `revoked_at` ставят «Выйти», блок тренера и смена пароля админом; refresh с отозванным `sid` не продлевается. Только сервер, RLS без политик. Миграция `20261006120000_auth_sessions.sql`. С 10.10 колонка `device_id` — устройство, с которого выдана сессия (миграция `20261010120000_user_devices.sql`) |
| `user_devices` | `id`, уникально `(user_id, device_id)` | Устройства тренера: `approved` / `pending` / `revoked`, подпись (`label`), кто и когда решил. Первое — разрешено сразу, следующие ждут админа (`/admin/devices`). Только сервер, RLS без политик. Миграция `20261010120000_user_devices.sql`. Телефон тренера (`/coach`) — `device_id` с префиксом `coach-`: свой вид, всегда ждёт админа, одно разрешённое на тренера ([COACH_APP.md](./COACH_APP.md)) |
| `device_health` | `id`, уникально `(user_id, device_id)` | Центр сбоев: состояние планшета тренера. `problems` — коды от планшета, `server_problems` — от cron (`server_no_pull`), `last_report_at` / `last_pull_ok_at`, `problem_since`, `notified_at`/`notified_codes` (push без повторов), `resolved_*` («Решено» админа). Только сервер, RLS без политик. Миграция `20261026120000_device_health.sql` — [DEVICE_HEALTH.md](./DEVICE_HEALTH.md) |
| `coach_invites` | `id`, уникально `token_hash` | QR с планшета для входа на телефоне: только sha256 кода, `device_id` первого отсканировавшего телефона, `expires_at` (10 мин; после сканирования 24 ч ожидания «Разрешить»), `used_at` при входе. `kind`: `qr` или `handoff` — вход значка iPhone из Safari (2 ч, `device_id` = уже разрешённый телефон). Только сервер, RLS без политик. Миграции `20261012130000_coach_invites.sql`, `20261012140000_coach_invites_kind.sql` |
| `client_invites` | `id` | Приглашения в приложение клиента `/me`: `token_hash` (sha256, сам токен не хранится), `expires_at` (72 ч), `used_at` (одноразовое), `created_by`. Только сервер, RLS без политик. Миграция `20261007120000_client_portal.sql` |
| `client_sessions` | `id` (= `sid` в токене клиента) | Сессии клиента: `revoked_at` — «Выйти» или «Отключить все входы»; архив клиента закрывает доступ без записи сюда. Та же миграция, плюс GIN-индекс `trainer_schedule_entries.client_ids` для «следующей тренировки» |
| `user_push_subscriptions` | `id`; `endpoint` UNIQUE | Push-подписки сотрудников. С 12.10 колонка `app` (`staff` — планшет и админка, `coach` — телефон тренера `/coach`): по ней ссылка в push ведёт в нужное приложение. Миграция `20261012120000_coach_app.sql` |
| `client_push_subscriptions` | `id`; `endpoint` UNIQUE | Push-подписка телефона клиента: `client_id`, `session_id` (сессия отозвана — напоминаний нет, строку чистит cron), ключи `p256dh` / `auth`. Только сервер, RLS без политик. Миграция `20261007190000_client_push.sql` |
| `client_reminder_log` | `(client_id, day_date, start_minutes)` | Журнал отправленных напоминаний: одно на клиента и слот. Хранится 30 дней. Та же миграция |
| `trainer_schedule_reminder_log` | `(entry_id, day_date, start_minutes)` | Журнал push тренеру за 15 минут до записи Ежедневника: одно на запись и её время, хранится 7 дней. Выключатель устройства — `user_push_subscriptions.schedule_reminders` (по умолчанию `true`). Миграция `20261015120000_trainer_schedule_reminders.sql`, [TRAINER_SCHEDULE.md](./TRAINER_SCHEDULE.md) §2f |
| `inbox_campaigns` | `id` | Рассылка во «Входящие»: `kind` (`notice` / `survey`), `audience` (`clients` / `staff`), `staff_roles` (jsonb: `trainer` / `sales` / `supervisor`), `title`, `body`, `questions` (jsonb, id `q1…`), `reward_points` (только клиентам), `club_ids` / `halls` (jsonb), `created_by`, `expires_at`, `closed_at`, `recipients_count`, `push_status`, `trigger` (NULL — рассылка «сейчас»; `trainings_10` — автоопрос клиентам после 10-й тренировки, открыт до `closed_at`). Только сервер, RLS без политик. Миграции `20261008120000_club_inbox.sql`, `20261008130000_inbox_staff.sql`, `20261008150000_inbox_trigger.sql`, [INBOX.md](./INBOX.md) |
| `inbox_deliveries` | `id`; `(campaign_id, client_id)` UNIQUE; `(campaign_id, user_id)` UNIQUE | Строка на получателя — ровно один из `client_id` / `user_id` (CHECK): `club_id`, `read_at`, `answered_at`, `answers` (jsonb), `reward_points` (положено за опрос), `reward_granted_at` (баллы начислены — ставится при ответе клиента). Те же миграции |
| `chat_threads` | `id`; `(client_id, kind)` UNIQUE; индексы `(club_id, kind, last_message_at DESC)`, `(last_message_at DESC)` | Диалог клиента: `kind` (`trainer` / `sales` / `supervisor`), `club_id` (клуб клиента на момент последнего сообщения), `last_message_at`, `last_author` (`client` / `staff`), `last_preview` (≤120), `client_read_at`, `staff_read_at` (общее на сотрудников), `client_unread` / `staff_unread` (число новых для кружка в списке; +1 при сообщении другой стороны, 0 при открытии; при гонке может отстать — UI показывает минимум 1). Создаётся первым сообщением; удаляется (с сообщениями) через 90 дней после ухода клиента в архив — `chatRetentionJob.js`. Доступ сотрудника — по текущей строке клиента, не по полям диалога. Только сервер, RLS без политик. Миграция `20261011120000_client_chat.sql`, [CHAT.md](./CHAT.md) |
| `chat_messages` | `id`; индекс `(thread_id, created_at DESC)` | Сообщение: `thread_id`, `author_side` (`client` / `staff`), `author_client_id` / `author_user_id`, `body` (1–2000, CHECK), `sticker` (id из `chatStickerCore.js` или NULL; у стикера `body` = подпись), `created_at`, `client_msg_id` (номер от телефона, уникален в диалоге — повтор без дубля). Та же миграция; `client_msg_id` и триггер `chat_messages_after_insert` (счётчики, время, автор, превью диалога) — `20261016120000_chat_atomic_counters.sql` |
| `staff_dm_threads` | `id`; `(user_lo, user_hi)` UNIQUE, CHECK `user_lo < user_hi`; индексы `(user_lo, last_message_at DESC)`, `(user_hi, last_message_at DESC)` | Личный диалог двух сотрудников (папки «Коллеги» / «Администрация»): пара `users` упорядочена — один диалог на двоих; `club_id` (клуб автора первого сообщения), `last_message_at`, `last_author` (id пользователя), `last_preview`, `lo_read_at` / `hi_read_at`, `lo_unread` / `hi_unread` — у каждой стороны свои. Создаётся первым сообщением. Права — `staffDmAccessCore.js` (только тренер / менеджер / управляющий своего клуба, главный админ — нет). Только сервер, RLS без политик. Миграция `20261013120000_staff_dm.sql`, [CHAT.md](./CHAT.md) |
| `staff_dm_messages` | `id`; индекс `(thread_id, created_at DESC)` | Сообщение сотрудника: `thread_id`, `author_user_id`, `body` (1–2000), `sticker`, `created_at`, `client_msg_id`. Та же миграция; `client_msg_id` и триггер `staff_dm_messages_after_insert` — `20261016120000_chat_atomic_counters.sql` |
| `staff_group_threads` / `staff_group_messages` / `staff_group_reads` / `staff_group_message_reactions` | `staff_group_threads.club_id` UNIQUE (один чат на клуб, удалили клуб — удалился чат); сообщения — индекс `(thread_id, created_at DESC)`, UNIQUE `(thread_id, client_msg_id)`; `staff_group_reads` — PK `(thread_id, user_id)`; реакции — PK `(message_id, reactor)` | Чат клуба ([CHAT.md](./CHAT.md) § «Чат клуба»). Участники **не хранятся** — активные тренеры / менеджеры / управляющие клуба по `users`. Тред: `last_message_at`, `last_author` (id), `last_preview` — ведёт триггер на вставку сообщения (он же ставит автору «прочитано»); закреп — `pinned_message_id` (удалили сообщение — `NULL`), `pinned_by`, `pinned_at` (миграция `20261028120000_staff_group_pin.sql`). Сообщение: `author_user_id`, `body` / `sticker`, `reply_to`, голосовые колонки как у `staff_dm_messages`. `staff_group_reads`: `read_at` и `muted` («без звука») — у каждого свои. Только сервер (RLS, без доступа anon / authenticated). Миграция `20261027120000_staff_group_chat.sql` |
| `chat_message_reactions` / `staff_dm_message_reactions` | `(message_id, reactor)` | Реакция на сообщение: `reactor` (`c:<client_id>` / `u:<user_id>`), `emoji` (один смайлик из каталога, `chatReactionCore.js`), `created_at`. Одна от человека на сообщение; удаляется вместе с сообщением. Для значка в списке диалогов: `chat_threads.last_reaction_at / last_reaction_emoji / last_reaction_by` + `client_reaction_seen_at` / `staff_reaction_seen_at`; у `staff_dm_threads` — те же три + `lo_reaction_seen_at` / `hi_reaction_seen_at`. «Ответить»: `chat_messages.reply_to` / `staff_dm_messages.reply_to` — id сообщения того же диалога (удалили исходное — `NULL`), `20261019120000_chat_reply.sql`. Только сервер (RLS, без доступа anon / authenticated). `20261018120000_chat_reactions.sql` |
| фото профиля в `users` / `clients` | — | `avatar_key` (`NULL` — нет фото): файл в бакете `CHAT_VOICE_BUCKET`, `avatar/{c\|u}-<владелец>/<uuid>.jpg`, хранится, пока не сменили / не удалили. Пишет только сам человек через API (`avatarOp`); из push планшета (`clients`) поле вырезается — старая копия не затрёт новое фото. Наружу — ссылка `/api/me-profile?avatar=<ключ>`, только если ключ принадлежит этой строке. `20261101120000_profile_avatar.sql` |
| статус у имени в `users` / `clients` | — | `status_emoji` (смайлик из набора `profileStatusCore.js`, `NULL` — нет), `status_until` (`timestamptz`, `NULL` — без срока; вышел — не показываем). Пишет только сам человек через API (`avatarOp`, op `status`); из push планшета (`clients`) поля вырезаются. 🎂 клиента в день рождения не хранится — считается из `birth_date`. `20261102120000_profile_status.sql` |
| голосовые в `chat_messages` / `staff_dm_messages` | — | `voice_key` (файл MP3 в бакете `CHAT_VOICE_BUCKET`, `voice/{c\|u}-<автор>/<id отправки>.mp3`; наружу не отдаётся), `voice_sec` (1–300, CHECK), `voice_wave` (48 чисел 0–100 для пузыря), `voice_text` (расшифровка «→ Аа»: `NULL` — не расшифровывали, `''` — слов нет; навсегда), `voice_stt_op` (идёт распознавание SpeechKit). `body` = «🎤 Голосовое m:ss». Звук слушается 24 ч с `created_at` (сервер), файл удаляет правило бакета через сутки. `voice_played_at` — когда получатель впервые загрузил звук («прослушано», синяя точка гаснет), `20261021120000_chat_voice_played.sql`. `voice_once` (по умолчанию `false`) — одноразовое: после первого прослушивания `voice_key = NULL`, звук больше не отдаётся, `20261022120000_chat_voice_once.sql`. `20261020120000_chat_voice.sql` |
| фото, PDF и видеокружки в `chat_messages` / `staff_dm_messages` / `staff_group_messages` | — | `attach_kind` (`photo` \| `file` \| `video` \| `sticker`, CHECK; `NULL` — без вложения; `sticker` — картинка с прозрачностью со своей клавиатуры, файл `chat-sticker/{c\|u}-<автор>/<id>.<png\|webp>`, хранится навсегда, `20261031120000_chat_attach_sticker.sql`), `attach_sec` (длительность кружка 1–60 с, только у `video`; `20261030120000_chat_video.sql`, «📹 Видеосообщение m:ss» в `body`), `attach_key` (файл в том же бакете, `voice/att/{c\|u}-<автор>/<id отправки>.<jpg\|png\|webp\|pdf\|mp4\|webm>`; наружу не отдаётся), `attach_mime` (по первым байтам), `attach_bytes`, `attach_name` (имя PDF, очищенное), `attach_w` / `attach_h` (размер фото — место в ленте до загрузки), `attach_caption` (подпись ≤1000). `body` = «📷 Фото» / «📷 подпись» / «📎 имя» / «📎 имя · подпись». Файл отдаётся 24 ч с `created_at`, удаляет правило бакета через сутки. `20261029120000_chat_attach.sql` |
| `inbox_points_redemptions` | `id`; индекс `(client_id, created_at DESC)` | Списание баллов за опросы на стойке: `client_id`, `club_id`, `points` (> 0), `comment`, `actor_id` (кто списал), `created_at`. Баланс клиента = сумма `reward_points` с `reward_granted_at` − сумма `points`. Только сервер, RLS без политик. Миграция `20261008140000_inbox_points.sql` |

Миграции SMS / звонки / moizvonki: `club_sms_templates`, `club_sms_log`, `20260805230000_club_iskra_moizvonki.sql`, `20260813210000_club_sms_log_status.sql`, `20260813220000_club_call_log.sql`, `20260814153000_club_call_log_outcome.sql`, `20260814210000_club_call_log_recording.sql`, `20260815010000_club_call_log_staff_note.sql`, `20260816020000_club_call_log_inbound.sql`, `20260820160000_club_call_log_funnel_chips.sql`.

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
| **memberships** | Период, лимит тренировок, тип карты, **`hall`** (pz/tz/az); опционально `paid_amount` (**цена** пакета на desk/lite, не ledger оплаты); desk АЗ — `used_trainings` + `session_visits`; у ПЗ списание при завершении тренировки; удаление с карточки только без связанных тренировок. **Новая запись / правка лимита:** `total > 0` не меньше уже списанных; платные с `total` 1…3 — confirm (не БЗ). Пути: карточка, desk АЗ, sale clip. Старые битые не авто-чинятся. Канон: [CLIENT_MULTI_HALL.md](./CLIENT_MULTI_HALL.md) |
| **trainings** | Дата, тип, статус, JSON `data`: упражнения, вес, **`membership_id`** (абон при завершении; backfill при save), опционально `laterality`, `hr_session` — см. [TRAINING_HR.md](./TRAINING_HR.md). Колонка **`updated_at`** — ревизия для merge completed при Sync (см. [SYNC.md](./SYNC.md)). |
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
- `public.users.linked_user_id` — совмещённые роли: тренерская учётка и учётка управляющего одного человека ссылаются друг на друга. Действует только целиком (взаимно, тренер + управляющий, один клуб, обе активны — `src/lib/chat/linkedStaffCore.js`); влияет только на переписку ([CHAT.md](./CHAT.md) «Совмещённые роли»). Ставит главный админ (`admin-data?action=staff-link`), пишет только сервер. Миграция `20261014120000_users_linked_user.sql`.
- `club_iskra_settings.moizvonki` — jsonb аккаунта Мои Звонки на клуб (не в IDB-смысле секрета для клиента).
- Прайс ПЗ: `club_price_lists` (один JSON-документ на `club_id`) — [PRICE_LIST.md](./PRICE_LIST.md).
- Прайс ТЗ: `club_tz_price_lists` — [PRICE_LIST.md](./PRICE_LIST.md).
- Прайс АЗ: `club_az_price_lists` — [PRICE_LIST.md](./PRICE_LIST.md).

Объём и пороги pull: [DATA_VOLUME.md](./DATA_VOLUME.md).

---

## Паритет agg

Клиент: `src/lib/admin/*Agg.js`.  
Сервер: `api/_lib/*Agg.js`.  
При изменении одного — второе + `scripts/verify-*.mjs` (см. [TESTING.md](./TESTING.md)). Тип карты в журнале/ЗП: `membershipTypeStatsAgg.js` + `verify-membership-type-stats.mjs`, `verify-stats-agg-parity.mjs`.
