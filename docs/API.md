# API — каталог endpoints

**Актуально:** 2026-08-06. Vercel Hobby **≤12** serverless functions в `api/*.js`. Новое действие — сначала `admin-data?action=`, не новый файл.

Политика: `.cursor/rules/fitness-diary-supabase.mdc`, `fitness-diary-architecture.mdc`.  
Ядро: **`api/_lib/`** (не `api/lib/`).

---

## Top-level `api/*.js`

| Endpoint | Назначение |
|----------|------------|
| `/api/admin-data` | Объединённый GET/POST админки, продаж, ИСКРЫ, справочников (`?action=`) |
| `/api/trainer-pull` | Pull данных на планшет тренера |
| `/api/push-record` | Одна запись из sync-очереди (admin / trainer / sales_manager; права по таблице — `authorizePush`) |
| `/api/push-records` | Пакетный flush очереди (те же роли) |
| `/api/auth-sign-in` | Вход (логин/пароль → сессия), когда нужен server path |
| `/api/me-profile` | Профиль текущего пользователя |
| `/api/list-clients` | Список клиентов клуба (admin / sales_manager своего клуба) |
| `/api/list-trainers` | Список тренеров (admin / trainer; sales_manager — только свой клуб) |
| `/api/list-memberships` | Абонементы клуба (admin / sales_manager своего клуба) |
| `/api/get-client` | Один клиент (admin / trainer свои / sales_manager своего клуба). Query: `client_id`, опционально `scope=full\|glance` (glance — клиент + абоны, без дневника; desk ТЗ/АЗ и lite-ПЗ без планшета) |
| `/api/create-trainer` | Создание тренера (service role на сервере) |
| `/api/update-trainer-club` | Смена клуба тренера |

Считать лимит перед добавлением 13-го файла. Удаление тренера — **не** отдельный `api/*.js`: `admin-data?action=delete-trainer` (с 2026-08-06). Legacy Edge `supabase/functions/delete-trainer` для прода не нужен.

---

## `admin-data?action=` (основные)

Точный роутинг — `api/admin-data.js` + handlers в `api/_lib/adminData/` и `api/_lib/*Handler.js`.

### GET (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `search`, `clients-last-trainings` | admin / sales_manager (свой `club_id`) | Поиск / даты последних тренировок по id (список клиентов) |
| `journal` | admin | Журнал тренировок |
| `club-stats`, `club-monthly` | admin | Сводка и год. `club-stats&include_cq=0` — лёгкая сводка без CQ (default `include_cq=1` для совместимости) |
| `coach-quality` | admin / trainer (свой клуб + свой id) | Отдельный расчёт CQ; `mode=full\|glance`. Статистика и главная грузят параллельно со сводкой |
| `coach-quality-settings` | GET: admin или тренер/продажи своего клуба; POST: admin | веса осей, доли внутри ведения/хвостов и тумблеры |
| `health-cards`, `clubs` | admin | Медкарты, клубы |
| `sales` | admin / sales_manager | Отчёты продаж. Опционально `profile=shell\|daily\|month\|full` (default `full`); `include_fit_city=1` для подсказок типов |
| `price-list` | GET: admin / sales_manager (свой клуб); POST: admin / sales_manager (свой клуб) | Прайс ПЗ клуба (`club_price_lists`) |
| `tz-price-list` | GET/POST: admin / sales_manager (свой клуб) | Прайс ТЗ клуба (`club_tz_price_lists`) |
| `az-price-list` | GET/POST: admin / sales_manager (свой клуб) | Прайс АЗ клуба (`club_az_price_lists`) |
| `pnk` | admin / sales_manager | Доска / данные ПНК |
| `sale-clips` | admin / sales_manager | Клип-карты дня (список) |
| `gemini-analytics-prefetch` | admin | Prefetch ИСКРЫ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch`, `iskra-tts` | admin (+ dispatch шире) | Настройки, обучение, задания, neural озвучка |
| `challenges`, `challenge-trainings`, `exercises`, `exercises-meta` | admin / trainer | Справочники |
| `trainer-self-stats` | trainer (свой клуб) / admin+trainer_id | ЗП день/месяц + сводка периода (сервер) |
| `trainer-self-journal` | trainer (свой клуб) / admin+trainer_id | Список завершённых тренировок за период (для журнала на планшете; тот же контур, что цифры stats) |
| `deletion-audit-log` | admin / sales_manager (свой клуб) | Журнал жёстких удалений клиентов (`deletion_audit_log`) |
| `push-subscription` | admin / trainer / sales_manager | VAPID public key |
| `membership-types` | admin / trainer / sales_manager (свой клуб) | Справочник типов абон. включая АЗ для колонок отчёта |
| `club-sms` | admin / sales_manager / supervisor | Статус Мои Звонки (`configured`, `moizvonki`, `templates`, `club_name`); `&logs=1&since_days=` — журнал `club_sms_log` |

### POST (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `sales-daily`, `sales-plan` | admin / sales_manager | День / план. `sales-plan` scope `strategy_snapshot` — снимок playbook Стратегии; `promotions` — акции месяца (цели шт). В дне — `promo_sales` + список `promotions` для проверки ≤ факта сегмента |
| `sales-finance`, `create-sales-manager`, `create-supervisor` | admin (`sales-finance` также supervisor своего клуба) | Финансы клуба; создание менеджера / управляющего |
| `price-list` | admin / sales_manager (свой клуб) | Upsert прайса ПЗ клуба |
| `tz-price-list` | admin / sales_manager (свой клуб) | Upsert прайса ТЗ клуба |
| `az-price-list` | admin / sales_manager (свой клуб) | Upsert прайса АЗ клуба |
| `gemini-analytics` | admin | Запрос к ИСКРЕ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch`, `iskra-tts` | по op / роли | CRUD настроек, фидбек, задания, TTS |
| `push-subscription` | auth user | Регистрация push |
| `reset-trainer-password`, `set-trainer-active`, `set-trainer-name`, `set-trainer-uses-tablet`, `delete-trainer` | admin | Управление тренером (пароль / блок / ФИО / планшет / удаление без клиентов) |
| `pnk` | admin / sales_manager | Мутации ПНК |
| `sale-clips` | admin / sales_manager | POST create / cancel / match клипа |
| `club-sms` | admin / sales_manager / supervisor | SMS клиенту через Мои Звонки клуба (`client_id`, `scenario` / `text`); после успеха — запись в `club_sms_log` |
| `iskra-settings` | admin | в т.ч. `moizvonki` — аккаунт Мои Звонки на клуб (ключ в ответе не отдаём) |

---

## Куда класть новое

1. Чистая логика → `api/_lib/…Core.js` или handler в `api/_lib/adminData/`.
2. Тонкий вызов из `api/admin-data.js` (или существующий `api/*.js`).
3. Клиент: сервис в `src/lib/admin/` / `src/lib/pnk/`, не `supabase.from` с планшета для критичного пути.
4. Обновить этот файл + при необходимости handoff.

Auth helpers: `api/_lib/adminSupabase.js` (`requireAdmin`, `requireAdminOrSalesManager`, `requireAuthUser`).
