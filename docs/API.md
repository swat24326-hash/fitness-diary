# API — каталог endpoints

**Актуально:** 2026-08-13. Vercel Hobby **≤12** serverless functions в `api/*.js`. Новое действие — сначала `admin-data?action=`, не новый файл.

Политика: `.cursor/rules/fitness-diary-supabase.mdc`, `fitness-diary-architecture.mdc`.  
Ядро: **`api/_lib/`** (не `api/lib/`). Точный роутинг ролей — `api/admin-data.js` (таблица ниже — ориентир; при сомнении смотреть handler).

---

## Top-level `api/*.js`

| Endpoint | Назначение |
|----------|------------|
| `/api/admin-data` | Объединённый GET/POST админки, продаж, ИСКРЫ, справочников (`?action=`) |
| `/api/trainer-pull` | Pull данных на планшет тренера |
| `/api/push-record` | Одна запись из sync-очереди (admin / trainer / sales_manager / **supervisor**; права по таблице — `authorizePush`) |
| `/api/push-records` | Пакетный flush очереди (те же роли) |
| `/api/auth-sign-in` | Вход (логин/пароль → сессия), когда нужен server path |
| `/api/me-profile` | Профиль текущего пользователя |
| `/api/list-clients` | Список клиентов клуба (admin / sales_manager своего клуба) |
| `/api/list-trainers` | Список тренеров (admin / trainer; sales_manager — только свой клуб) |
| `/api/list-memberships` | Абонементы клуба (admin / sales_manager своего клуба) |
| `/api/get-client` | Один клиент (admin / trainer свои / sales_manager своего клуба). Query: `client_id`, опционально `scope=full\|glance` (glance — клиент + абоны, без дневника; desk ТЗ/АЗ и lite-ПЗ без планшета) |
| `/api/create-trainer` | Создание тренера (service role на сервере) |
| `/api/update-trainer-club` | Смена клуба тренера |

Считать лимит перед добавлением 13-го файла. Удаление тренера — **не** отдельный `api/*.js`: `admin-data?action=delete-trainer`. Legacy Edge `supabase/functions/*` для прода не нужен.

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
| `coach-quality-settings` | GET: admin или trainer/sales/**supervisor** своего клуба; POST: admin | веса осей, доли внутри ведения/хвостов и тумблеры |
| `trainer-pay-plan-settings` | GET: admin / sales_manager / supervisor своего клуба; POST: admin | пороги тренировок месяца → уровни ЗП 1–3 |
| `trainer-pay-profiles` | GET: admin / sales_manager / supervisor своего клуба; POST: admin | кабинеты тренеров: `on_plan`, `rate_adjustment_rub` |
| `trainer-pay-payroll-context` | GET: admin / sales_manager (свой клуб) | контекст ЗП на `year`+`month`: live или снимок (`frozen`); при первом запросе прошлого месяца создаёт snapshot |
| `health-cards`, `clubs` | health-cards: admin / **supervisor**; clubs: admin | Медкарты, клубы |
| `sales` | admin / sales_manager | Отчёты продаж. Опционально `profile=shell\|daily\|month\|full` (default `full`); `include_fit_city=1` для подсказок типов |
| `price-list` | GET: admin / sales_manager (свой клуб); POST: admin / sales_manager (свой клуб) | Прайс ПЗ клуба (`club_price_lists`) |
| `tz-price-list` | GET/POST: admin / sales_manager (свой клуб) | Прайс ТЗ клуба (`club_tz_price_lists`) |
| `az-price-list` | GET/POST: admin / sales_manager (свой клуб) | Прайс АЗ клуба (`club_az_price_lists`) |
| `pnk` | admin / sales_manager | Доска / данные ПНК; в ответе `bz_completed_by_client` (id → 0…2) для «Итога визита» |
| `sale-clips` | admin / sales_manager | Клип-карты дня (список) |
| `gemini-analytics-prefetch` | admin | Prefetch ИСКРЫ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch` | admin (+ dispatch шире: trainer / sales / supervisor по view) | Настройки, обучение, задания |
| `challenges`, `challenge-trainings`, `exercises`, `exercises-meta` | admin / trainer | Справочники |
| `nutrition-products`, `homework-presets` | admin / trainer (как trainerActions) | Справочники питания и ДЗ |
| `trainer-self-stats` | trainer (свой клуб) / admin+trainer_id | ЗП день/месяц + сводка периода (сервер) |
| `trainer-self-journal` | trainer (свой клуб) / admin+trainer_id | Список завершённых тренировок за период (для журнала на планшете; тот же контур, что цифры stats) |
| `deletion-audit-log` | **admin** (HTTP: `requireAdmin`) | Журнал жёстких удалений клиентов (`deletion_audit_log`). UI `/sales/deletion-log` у менеджера — отдельный accessMode; API-лог — admin |
| `push-subscription` | admin / trainer / sales_manager / **supervisor** | VAPID public key |
| `membership-types` | admin / trainer / sales_manager / **supervisor** (свой клуб) | Справочник типов абон. включая АЗ для колонок отчёта |
| `club-sms` | admin / sales_manager / supervisor | Статус Мои Звонки (`configured`, `moizvonki`, `templates`, `club_name`); `&logs=1&since_days=` — журнал `club_sms_log`; `&day=YYYY-MM-DD` — один день по календарю клуба (МСК) |
| `club-call` | admin / sales_manager / supervisor | Статус Мои Звонки для звонка; `&logs=1&since_days=` — журнал; `&day=YYYY-MM-DD` — один день МСК; `&glance=1` — очередь «кому звонить» (пометки + пропущенные); `&client_id=` — фильтр по клиенту |

### POST (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `sales-daily`, `sales-plan` | admin / sales_manager | День / план. `sales-plan` scope `strategy_snapshot` — снимок playbook Стратегии; `promotions` — акции месяца (цели шт). В дне — `promo_sales` + список `promotions` для проверки ≤ факта сегмента |
| `sales-finance`, `create-sales-manager`, `create-supervisor` | admin (`sales-finance` также supervisor своего клуба) | Финансы клуба; создание менеджера / управляющего |
| `price-list` | admin / sales_manager (свой клуб) | Upsert прайса ПЗ клуба |
| `tz-price-list` | admin / sales_manager (свой клуб) | Upsert прайса ТЗ клуба |
| `az-price-list` | admin / sales_manager (свой клуб) | Upsert прайса АЗ клуба |
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
