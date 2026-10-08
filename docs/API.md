# API — каталог endpoints

**Актуально:** 2026-10-07. Новое действие — сначала `admin-data?action=`; отдельный файл — для отдельного контура (как приложение клиента `client-*`).

Политика: `.cursor/rules/fitness-diary-supabase.mdc`, `fitness-diary-architecture.mdc`.  
Ядро: **`api/_lib/`** (не `api/lib/`). Точный роутинг ролей — `api/admin-data.js` (таблица ниже — ориентир; при сомнении смотреть handler).

---

## Top-level `api/*.js`

| Endpoint | Назначение |
|----------|------------|
| `/api/admin-data` | Объединённый GET/POST админки, продаж, ИСКРЫ, справочников (`?action=`) |
| `/api/list-memberships` | Абонементы **всех** клиентов клуба + `client_hall_lifecycle` того же клуба — **только admin / sales_manager** своего клуба. **Тренер не вызывает** (403): абонементы и lifecycle на планшете — `/api/trainer-pull` |
| `/api/trainer-pull` | Pull на планшет тренера: клиенты, **memberships** (своих клиентов), health_cards, trainings (опц. `skip_trainings=1`) |
| `/api/push-record` | Одна запись из sync-очереди (admin / trainer / sales_manager / **supervisor**; права по таблице — `authorizePush`). Тренер (`clients` / `trainings` / `memberships`, insert и update): указанный `club_id` = клуб профиля, своего клиента или самой строки, иначе **403**; пустой не меняется (`trainerPushClubBindingCore.js`). `challenges` (тренер, управляющий): клуб строки в базе по id и указанный `club_id` = клуб профиля, иначе **403** «Челлендж другого клуба» (`challengePushClubCore.js`). После успешного insert/update `clients` сервер пишет `burn_archive` / `club_move` в `loyalty_ledger` (не очередь) |
| `/api/push-records` | Пакетный flush очереди (те же роли) |

После ответа `push-record(s)` по успешным строкам `trainings` (завершённая, не «Списание») сервер **фоном** проверяет автоопросы «после 10-й тренировки» (`api/_lib/inbox/inboxMilestoneJob.js`): ответ тренеру не ждёт, сбой — только в лог, очередь не трогает. [INBOX.md](./INBOX.md)
| `/api/auth-sign-in` | Вход (логин/пароль → сессия), когда нужен server path. За 15 мин: 10 неудач на «логин + IP», 30 на логин со всех IP (кроме IP, с которого по логину уже входили), 100 на IP → **429** + `Retry-After` («Подождите N мин.») — `authRateLimitCore.js`. IP — правый адрес `X-Forwarded-For` от Caddy на localhost (Caddy перезаписывает заголовок), иначе адрес сокета |
| `/api/me-profile` | Профиль текущего пользователя |
| `/api/list-clients` | Список клиентов клуба (admin / sales_manager своего клуба) |
| `/api/list-trainers` | Список тренеров (admin / trainer; sales_manager — только свой клуб) |
| `/api/get-client` | Один клиент (admin / trainer свои / sales_manager своего клуба). Query: `client_id`, опционально `scope=full\|glance` (glance — клиент + абоны, без дневника; desk ТЗ/АЗ и lite-ПЗ без планшета) |
| `/api/create-trainer` | Создание тренера (service role на сервере) |
| `/api/update-trainer-club` | Смена клуба тренера |
| `/api/client-invite` | **Приложение клиента.** POST `{ client_id, action? }`, только сотрудник: тренер — своему клиенту, управляющий / менеджер — клиенту своего клуба, админ — любому; архивный клиент — 409. `create` (по умолчанию) → `{ token, expires_at }`: одноразовый, 72 ч, в базе только sha256; новая ссылка гасит прежнюю неиспользованную. `revoke` — отключить все входы клиента и открытые ссылки (`api/_lib/clientPortal/`) |
| `/api/client-auth` | **Приложение клиента**, без Bearer. POST `{ action: 'redeem', token }` → сессия клиента; `refresh` / `logout` по `refresh_token`. Токены `typ: client` / `client_refresh` (тот же `JWT_SECRET`): API сотрудника их не принимает, `/api/client-me` не принимает токены сотрудника. Лимит: 10 неудачных redeem с IP за 15 мин → 429. Нет `JWT_SECRET` — 503 |
| `/api/client-me` | **Приложение клиента.** GET, только токен клиента; сессия и архив проверяются на каждый запрос. Ответ — белые списки: абонементы (метка типа, срок, остаток по дневнику; `visits` — тренировки, списанные на этот абонемент, для `/me/trainings`: только `id, date, focus, kg, trainer_name, no_show`, ≤200, `clientMembershipVisitsCore.js`; у `last_ended` тоже), ближайший слот ежедневника (дата, время, имя тренера; без заметки), прогресс (визиты без неявок, `weeks_streak` — недели подряд с визитом, вес, замеры), бонусы ПЗ (итог `buildLoyaltyAccount` без записи `cycle_open`), клуб (`club.name`, `club.manifest_url`). Без `data` тренировок, оплат, телефонов и id сотрудников. `GET ?manifest=<uuid клуба>` — **без токена** (браузер так берёт manifest): PWA-manifest с названием клуба и нашими иконками, больше ничего; не uuid → 400 (`clientManifestCore.js`); `&h=<токен>` — вход значка на iPhone: попадает в `start_url` `/me?h=…`, ответ `no-store`, не токен по формату → 400. **POST** `{ action: 'training', id }` (токен клиента) → `{ training }` — одна своя завершённая тренировка для окна просмотра: шапка (дата, тип, имя тренера) и белый список `data` (замеры, пульс-итог, готовность, разминка, направленность, упражнения/подходы, заминка, RPE, оценка) **без заметок** — опрос, `trainer_comment` и любые `comment`/`note` в упражнениях отрезаны; чужая/черновик/нет → 404, не uuid → 400 (`clientTrainingViewCore.js`, `clientTrainingHandler.js`). **POST** `{ action: 'handoff' }` (токен клиента) → `{ token, expires_at }`: одноразовое приглашение на себя на 2 ч (`created_by = null`), гасит прежний handoff, ссылку из клуба не трогает (`clientHandoffHandler.js`). **POST** (токен клиента) — напоминания на этот телефон: `{ action: 'push-status', endpoint? }` → `{ configured, public_key, subscribed }`; `push-subscribe` (`endpoint`, `p256dh`, `auth`) — подписка привязывается к текущей сессии, endpoint только известных push-служб (FCM, Apple, Windows, Mozilla), иначе 400; без VAPID — 503; `push-unsubscribe` (`endpoint`) — удаляет только свою строку (`clientPushHandler.js`). **«Входящие»** ([INBOX.md](./INBOX.md)): в GET — `inbox_attention` (число для точки на конверте); POST `{ action: 'inbox-list' }` → `{ items, attention }` (≤50, без текста); `inbox-item` `{ id }` → `{ item }` целиком и отмечает прочитанным; `inbox-answer` `{ id, answers }` → `{ item }` (повтор / закрыт — 409, ответ не по вопросам — 400). Только свои доставки, без id клубов и автора (`api/_lib/inbox/inboxClientHandler.js`) |

**Ошибки БД в ответах:** клиент получает русский текст по SQLSTATE с нейтральным маркером класса (`duplicate key`, `foreign key violation`, `does not exist`, `permission denied`) и, если есть, именем ограничения в `[…]` (по нему подсказки «Помощи» на планшете) — без значений строк и эха ввода; `/rest/v1` сохраняет `code`, `details`/`hint` = null. Сырой текст — только в логе сервера (`api/_lib/dbErrorPublicCore.js`). Статусы не менялись. Остальные хендлеры (админка, ИСКРА, прайсы, ПНК…) получают ошибку из data client уже очищенной (`pgErrorForServer`): без `detail`/`hint`, эха ввода и ошибок подключения к базе; английский текст Postgres с именами таблиц/колонок остаётся (на нём фоллбэки старой схемы).

С 01.10.2026 прод — свой Node-хост (`server/portableApiHost.js` подхватывает любой `api/<name>.js`), лимит Vercel Hobby больше не действует; `client-*` — 13–15-й файлы. Vercel оставлен только redirect'ом. Удаление тренера — **не** отдельный `api/*.js`: `admin-data?action=delete-trainer`. Legacy Edge `supabase/functions/*` для прода не нужен.

---

## `admin-data?action=` (основные)

Точный роутинг — `api/admin-data.js` + handlers в `api/_lib/adminData/` и `api/_lib/*Handler.js`.

### GET (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `search`, `clients-last-trainings` | admin / sales_manager / supervisor (свой `club_id`) | Поиск / даты последних тренировок по id (список клиентов) |
| `journal` | admin / **supervisor** (свой клуб) | Журнал тренировок |
| `club-stats`, `club-monthly` | admin / **supervisor** (свой клуб) | Сводка и год. `club-stats&include_cq=0` — лёгкая сводка без CQ (default `include_cq=1`). Опционально `hall=pz\|tz\|az` — census и тренировки по залу; без `hall` — legacy commercial (без desk). На `hall=tz\|az` «по типам» = census абонов зала. CQ только для ПЗ / без hall |
| `coach-quality` | admin / trainer / **supervisor** (свой клуб + свой id у тренера) | Отдельный расчёт CQ; `mode=full\|glance`. Статистика и главная грузят параллельно со сводкой |
| `trainer-schedule` | **admin** / **supervisor** (свой клуб) | Read-only ежедневники тренеров: `club_id`, `day_from`, `day_to`, опц. `trainer_id` |
| `client-attendance` | admin / trainer / **supervisor** (как retention) | Посещаемость ПЗ: **средняя трен./нед.** (2 знака), % без выпадения, структура ритма, byTrainer, **previousWindow / deltaAvgVisitsPerWeek** (прошлые 30 дн.). Окно ритма = **фиксированные последние 30 дн.** до `date_to` (clamp сегодня); `date_from` периода сводки **игнорируется** для окна (остаётся в ответе как `summaryPeriodFrom`). Визиты по `client_id` пула. Параметры: `club_id`, `date_from`, `date_to`, опц. `trainer_id` |
| `client-retention` | admin / trainer / **supervisor** (свой клуб; у тренера — только свой `trainer_id`) | KPI удержания tablet-клиентов: M+3, продления **14 дн.** + **periodRenewal*** (end в периоде), архив, mix причин, M+3 по тренерам. Параметры: `club_id`, `date_from`, `date_to`, опц. `trainer_id`. См. `docs/CLIENT_RETENTION.md` |
| `coach-quality-settings` | GET: admin или trainer/sales/**supervisor** своего клуба; POST: admin | веса осей, доли внутри ведения/хвостов и тумблеры |
| `trainer-pay-plan-settings` | GET: admin / sales_manager / supervisor своего клуба; POST: admin | пороги тренировок месяца → уровни ЗП 1–3 |
| `trainer-pay-profiles` | GET: admin / sales_manager / supervisor своего клуба; POST: admin | кабинеты тренеров: `on_plan`, `rate_adjustment_rub` |
| `trainer-pay-payroll-context` | GET: admin / sales_manager (свой клуб) | контекст ЗП на `year`+`month`: live или снимок (`frozen`); при первом запросе прошлого месяца создаёт snapshot |
| `health-cards`, `clubs` | health-cards: admin / **supervisor**; clubs: admin | Медкарты, клубы |
| `sales` | admin / sales_manager | Отчёты продаж. Опционально `profile=shell\|daily\|month\|full` (default `full`); `include_fit_city=1` для подсказок типов |
| `price-list` | GET/POST: admin / sales_manager / **supervisor** (свой клуб) | Прайс ПЗ клуба (`club_price_lists`) |
| `tz-price-list` | GET/POST: admin / sales_manager / **supervisor** (свой клуб) | Прайс ТЗ клуба (`club_tz_price_lists`) |
| `az-price-list` | GET/POST: admin / sales_manager / **supervisor** (свой клуб) | Прайс АЗ клуба (`club_az_price_lists`) |
| `loyalty-settings` | GET: роли своего клуба; POST: **admin** | Ставки и интервалы лояльности ПЗ. UI: Структура `?tab=loyalty` |
| `loyalty-account` | trainer **свои** клиенты; sales / supervisor / admin клуба | Полный снимок баллов + лента ledger |
| `loyalty-glance` | те же; `ids` ≤ 200 | Снимки списка (`by_id`) |
| `loyalty-journal` | sales_manager / admin | Журнал списаний клуба: копилка ПЗ (`loyalty_ledger`, `kind=redeem`) и баллы за опросы (`inbox_points_redemptions`) одной лентой, новые сверху (≤200); у строки `source` = `pz` / `survey` |
| `inbox` | admin (любые клубы) / **supervisor** (свой клуб) | Рассылки во «Входящие» клиентов или команды ([INBOX.md](./INBOX.md)). GET `view=list` → `{ campaigns (≤30, со stats, audience, staff_roles), clubs, push_blocker }`; `view=detail&id=` → `{ campaign, results, respondents, can_close }` (управляющему — только доставки его клуба); `view=audience&club_ids=a,b&halls=pz,tz` (клиенты) или `&audience=staff&roles=trainer,sales,supervisor` → `{ matched, recipients }`. POST `{ op: 'send', draft }` (`draft.audience` = `clients` / `staff`, `staff_roles`) → `{ campaign_id, recipients, push: 'sent'\|'quiet'\|'off' }` (нет получателей — 409); `draft.trigger: 'trainings_10'` (только опрос клиентам) — автоопрос: сейчас никому, → `{ recipients: 0, push: 'trigger' }`; `{ op: 'close', id }` (сетевую — только admin). Логика — `api/_lib/inbox/`, правила — `src/lib/inbox/` |
| `my-inbox` | trainer / sales_manager / supervisor (свои доставки по `user_id` из Bearer) | «Сообщения клуба» сотрудника. GET → `{ items (≤50), attention }`; POST `{ op: 'item', id }` → `{ item }` (отмечает прочитанным), `{ op: 'answer', id, answers }` → `{ item }` (один раз, пока опрос открыт; повтор / закрыт — 409). Админ и пустая роль — 403. До миграции — пустой список. `api/_lib/inbox/inboxStaffHandler.js` + `inboxMailbox.js` |
| `survey-points` | смотреть: admin (любой клуб) / sales_manager / supervisor (свой клуб по строке клиента); списывать: admin / sales_manager своего клуба | Баллы клиента за опросы на стойке. GET `?client_id=` → `{ balance, earned, redeemed, history (≤20, новые сверху), can_redeem }`; POST `{ client_id, points, expected_balance, comment }` → то же после списания. Больше баланса / устаревший `expected_balance` — 409, не число — 400, тренер / чужой клуб — 403. До миграции — пустой счёт. `api/_lib/inbox/inboxPointsHandler.js`, [INBOX.md](./INBOX.md) |
| `pnk` | admin / sales_manager | Доска / данные ПНК; в ответе `bz_completed_by_client` (id → 0…2) для «Итога визита» |
| `sale-clips` | admin / sales_manager | Клип-карты дня (список) |
| `gemini-analytics-prefetch` | admin | Prefetch ИСКРЫ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch` | admin (+ dispatch шире: trainer / sales / supervisor по view) | Настройки, обучение, задания |
| `challenges`, `challenge-trainings`, `exercises`, `exercises-meta` | admin / trainer | Справочники; `challenge-trainings` — тренировки за период **и** краткие `clients` (id, name, trainer_id) для рейтинга |
| `nutrition-products`, `homework-presets` | admin / trainer (как trainerActions) | Справочники питания и ДЗ |
| `trainer-self-stats` | trainer (свой клуб) / admin+trainer_id | ЗП день/месяц + сводка периода (сервер) |
| `trainer-self-journal` | trainer (свой клуб) / admin+trainer_id | Список завершённых тренировок за период (для журнала на планшете; тот же контур, что цифры stats) |
| `deletion-audit-log` | **admin** (HTTP: `requireAdmin`) | Журнал жёстких удалений клиентов (`deletion_audit_log`). UI `/sales/deletion-log` у менеджера — отдельный accessMode; API-лог — admin |
| `push-subscription` | admin / trainer / sales_manager / **supervisor** | VAPID public key |
| `membership-types` | admin / trainer / sales_manager / **supervisor** (свой клуб) | Справочник типов абон. включая АЗ для колонок отчёта |
| `club-sms` | admin / sales_manager / supervisor | Статус Мои Звонки (`configured`, `moizvonki`, `templates`, `club_name`); `&logs=1&since_days=` — журнал `club_sms_log`; `&day=YYYY-MM-DD` — один день МСК; `&client_id=` — фильтр по клиенту |
| `club-call` | admin / sales_manager / supervisor | Статус Мои Звонки для звонка; `&logs=1&since_days=` — журнал; `&day=YYYY-MM-DD` — один день МСК; `&glance=1` — очередь «кому звонить» (пометки + пропущенные); `&client_id=` — фильтр по клиенту |

### POST (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `sales-daily`, `sales-plan` | admin / sales_manager | День / план. `sales-plan` scope `strategy_snapshot` — снимок playbook Стратегии; `promotions` — акции месяца (цели шт). В дне — `promo_sales` + список `promotions` для проверки ≤ факта сегмента |
| `sales-finance`, `create-sales-manager`, `create-supervisor` | admin (`sales-finance` также supervisor своего клуба) | Финансы клуба; создание менеджера / управляющего |
| `price-list` | admin / sales_manager / supervisor (свой клуб) | Upsert прайса ПЗ клуба |
| `tz-price-list` | admin / sales_manager / supervisor (свой клуб) | Upsert прайса ТЗ клуба |
| `az-price-list` | admin / sales_manager / supervisor (свой клуб) | Upsert прайса АЗ клуба |
| `loyalty-settings` | **admin** | Вкл/ставки клуба (интервалы `applyProgramToggle`) |
| `loyalty-redeem` | sales_manager / admin | Списать все баллы `{ client_id, expected_points, comment }`; 403/409 |
| `gemini-analytics` | admin | Запрос к ИСКРЕ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch`, `iskra-tts` | по op / роли; **`iskra-tts` только POST** | CRUD настроек, фидбек, задания, neural озвучка |
| `push-subscription` | auth user | Регистрация push |
| `reset-trainer-password`, `set-trainer-active`, `set-trainer-name`, `set-trainer-uses-tablet`, `delete-trainer` | admin | Управление тренером (пароль / блок / ФИО / планшет / удаление без клиентов) |
| `pnk` | admin / sales_manager | Мутации ПНК |
| `sale-clips` | admin / sales_manager | POST create / cancel / match клипа |
| `club-sms` | admin / sales_manager / supervisor | SMS клиенту через Мои Звонки клуба (`client_id`, `scenario` / `text`); в `club_sms_log` пишется **ok** после успеха и **fail** при постоянной ошибке (не 429). Массовая кампания на доске = N таких запросов с клиента (очередь + код + окно итога) |
| `club-call` | admin / sales_manager / supervisor | Исходящий звонок (`calls.make_call`, body: `club_id`, `client_id`); журнал `club_call_log` ok/fail (не 429); лимит ~10/мин на клуб; исход разговора — webhook. Пометка: `op: 'note'`, body `{ club_id, log_id, staff_note }` |
| `moizvonki-webhook` | секрет query/header | `call.finish` → дописывает исходящий **или** создаёт **входящий** (`direction=inbound`); `outcome` / запись / `mz_db_call_id` |
| `iskra-settings` | admin | в т.ч. `moizvonki` — аккаунт Мои Звонки на клуб (ключ в ответе не отдаём) |

---

## Куда класть новое

1. Чистая логика → `api/_lib/…Core.js` или handler в `api/_lib/adminData/`.
2. Тонкий вызов из `api/admin-data.js` (или существующий `api/*.js`).
3. Клиент: сервис в `src/lib/admin/` / `src/lib/pnk/`, не `supabase.from` с планшета для критичного пути.
4. Обновить этот файл + при необходимости handoff.

Auth helpers: `api/_lib/adminSupabase.js` (`requireAdmin`, `requireAdminOrSalesManager`, `requireAdminOrSupervisor`, `requireAuthUser`).

Клиент базы для API: `createServiceDataClient()` (`api/_lib/pgRest/serviceClient.js`). Без `DATA_BACKEND` или при `DATA_BACKEND=supabase` это Supabase service role. `DATA_BACKEND=pg` — тот же контракт `.from()` поверх Postgres (`DATABASE_URL`). Прод этот флаг не ставит.

Вход: `api/_lib/authPort.js`. `AUTH_PROVIDER=own` — свой JWT и хеш пароля в `users.password_hash`; проверка Bearer наша. Без флага — Supabase Auth. На портативном хосте тогда же открываются `POST /auth/v1/token`, `GET /auth/v1/user`, `POST /auth/v1/logout`. Logout (с 06.10) отзывает сессию из `auth_sessions` по `refresh_token` в теле (или Bearer); `?scope=global` — все устройства; ответ всегда 204. Заблокированный (`users.is_active=false`) получает на любом `/api/*` 403 «Учётная запись заблокирована» (до 30 с кэша роли) — планшет держит очередь, не снимает записи.

`/rest/v1/<таблица>` (только портативный хост, только при `AUTH_PROVIDER=own` **и** `DATA_BACKEND=pg`, иначе 404) — совместимый с supabase-js кусок PostgREST для браузера:

- **Методы:** GET, HEAD, POST (insert / upsert с `on_conflict`), PATCH, DELETE.
- **Фильтры:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`, `not.*`, `or=(…)`, плюс `order`, `limit`/`offset`.
- **Заголовки:** `Prefer` понимает `return`, `count=exact`, `resolution`, `missing=default`. Одна строка — через `Accept: application/vnd.pgrst.object+json`. Счётчик возвращается в `Content-Range`.
- **Доступ:** аноним (нет Bearer или Bearer = `apikey`, так supabase-js ходит до входа) — чтение отдаёт пустой результат, как RLS на Supabase; запись — 401. Любой другой Bearer должен быть нашим живым токеном, иначе 401 (сайт обновит сессию). Запрос выполняется под ролью `authenticated` с claims пользователя, поэтому решают политики RLS. `users.password_hash` для браузера закрыт.
- **Код:** `api/_lib/restV1Handler.js`, `api/_lib/pgRest/restV1*.js`, `rlsTx.js`.
