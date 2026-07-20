# API — каталог endpoints

**Актуально:** 2026-07-17. Vercel Hobby **≤12** serverless functions в `api/*.js`. Новое действие — сначала `admin-data?action=`, не новый файл.

Политика: `.cursor/rules/fitness-diary-supabase.mdc`, `fitness-diary-architecture.mdc`.  
Ядро: **`api/_lib/`** (не `api/lib/`).

---

## Top-level `api/*.js`

| Endpoint | Назначение |
|----------|------------|
| `/api/admin-data` | Объединённый GET/POST админки, продаж, ИСКРЫ, справочников (`?action=`) |
| `/api/trainer-pull` | Pull данных на планшет тренера |
| `/api/push-record` | Одна запись из sync-очереди |
| `/api/push-records` | Пакетный flush очереди |
| `/api/auth-sign-in` | Вход (логин/пароль → сессия), когда нужен server path |
| `/api/me-profile` | Профиль текущего пользователя |
| `/api/list-clients` | Список клиентов (облако) |
| `/api/list-trainers` | Список тренеров |
| `/api/list-memberships` | Абонементы |
| `/api/get-client` | Один клиент |
| `/api/create-trainer` | Создание тренера (service role на сервере) |
| `/api/update-trainer-club` | Смена клуба тренера |

Считать лимит перед добавлением 13-го файла. Edge Functions Supabase (`create-trainer` / `delete-trainer` в `supabase/functions/`) — отдельно от Vercel.

---

## `admin-data?action=` (основные)

Точный роутинг — `api/admin-data.js` + handlers в `api/_lib/adminData/` и `api/_lib/*Handler.js`.

### GET (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `search`, `journal`, `clients-last-trainings` | admin | Поиск / журнал / даты последних тренировок по id (список клиентов) |
| `club-stats`, `club-monthly` | admin | Сводка и год; в `club-stats` также `coachQuality` (те же trainings + конфиг клуба) |
| `coach-quality-settings` | GET: admin или тренер/продажи своего клуба; POST: admin | веса осей, доли внутри ведения/хвостов и тумблеры |
| `health-cards`, `clubs` | admin | Медкарты, клубы |
| `sales` | admin / sales_manager | Отчёты продаж |
| `pnk` | admin / sales_manager | Доска / данные ПНК |
| `gemini-analytics-prefetch` | admin | Prefetch ИСКРЫ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch` | admin (+ dispatch шире) | Настройки, обучение, задания |
| `challenges`, `challenge-trainings`, `exercises`, `exercises-meta` | admin / trainer | Справочники |
| `membership-types`, `nutrition-products`, `homework-presets` | admin / trainer | Типы карт, питание, ДЗ |
| `push-subscription` | admin / trainer / sales_manager | VAPID public key |

### POST (фрагмент)

| action | Кто | Зачем |
|--------|-----|--------|
| `sales-daily`, `sales-plan` | admin / sales_manager | День / план |
| `sales-finance`, `create-sales-manager` | admin | Финансы, создание менеджера |
| `gemini-analytics` | admin | Запрос к ИСКРЕ |
| `iskra-settings`, `iskra-learning`, `iskra-dispatch` | по op / роли | CRUD настроек, фидбек, задания |
| `push-subscription` | auth user | Регистрация push |
| `reset-trainer-password`, `set-trainer-active` | admin | Управление тренером |
| `pnk` | admin / sales_manager | Мутации ПНК |

---

## Куда класть новое

1. Чистая логика → `api/_lib/…Core.js` или handler в `api/_lib/adminData/`.
2. Тонкий вызов из `api/admin-data.js` (или существующий `api/*.js`).
3. Клиент: сервис в `src/lib/admin/` / `src/lib/pnk/`, не `supabase.from` с планшета для критичного пути.
4. Обновить этот файл + при необходимости handoff.

Auth helpers: `api/_lib/adminSupabase.js` (`requireAdmin`, `requireAdminOrSalesManager`, `requireAuthUser`).
