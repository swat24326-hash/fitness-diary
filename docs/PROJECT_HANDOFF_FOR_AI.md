# Описание проекта для передачи другой нейросети / разработчику

Документ самодостаточен: по нему можно продолжить работу без доступа к истории чата. Язык интерфейса пользователя — **русский**. Репозиторий: **fitness-diary** (PWA «дневник тренировок» для фитнес-клуба, бренд в UI — FIT-CITY).

---

## 1. Назначение продукта

Веб-приложение для **тренеров** и **администраторов** клуба:

- ведение **клиентов**, **абонементов**, **тренировок** (черновик → завершена);
- **медкарта** (карта здоровья), **обмеры**, **цель** клиента;
- **справочник упражнений** (админ);
- **организация**: клубы, тренеры (в т.ч. Edge Functions создания/удаления тренера);
- **статистика по клубу** (админ, при выбранном клубе): клиенты, действующие/не активные абонементы, тренировки, итог по году;
- офлайн-ориентированность: **IndexedDB** как кэш + **очередь синхронизации** в браузере; при наличии **Supabase** — обмен с облаком.

---

## 2. Технологический стек

| Слой | Технология |
|------|------------|
| UI | React 19, React Router 7 |
| Сборка | Vite 6, `@vitejs/plugin-react` |
| PWA | `vite-plugin-pwa` (service worker в production, `devOptions.enabled` только при `mode === 'production'`) |
| Бэкенд | Supabase: Postgres, Auth (`signInWithPassword`), Edge Functions |
| Локальное хранилище | `idb` (IndexedDB), см. `src/lib/localDb.js` |
| Стили | Глобальный CSS `src/index.css`, утилиты `src/styles/` |
| Иконки UI | `lucide-react`, частично Font Awesome |
| Графики | `chart.js`, `react-chartjs-2` (где используется) |
| Линт | ESLint 9 flat config `eslint.config.js`, скрипт `npm run lint` |

**TypeScript в проекте нет** — только `.js` / `.jsx`.

---

## 3. Структура каталогов (важное)

```
src/
  App.jsx                 — маршруты, layout, RoleOutlet
  main.jsx
  context/AuthContext.jsx — сессия, роль, isAdmin, signIn/signOut, supabaseReady
  lib/
    supabase.js           — createClient, isSupabaseConfigured (VITE_* + trim)
    localDb.js            — IndexedDB: stores, версия БД
    dataAccess.js         — реэкспорты + pull/list/get для клиентов, тренировок и т.д.
    syncService.js        — saveLocalWithSync, flushSyncQueue, deleteHealthCardByClientId; fallback для health_cards.goal
    membershipRules.js    — логика «действующий абонемент», pickUsableMembershipForDate, списание по дате
    bodyMeasures.js       — BODY_MEASURE_FIELDS, getMeasureValue (+ fallback на старые имена колонок)
    seedDemo.js           — демо-данные при локальном входе без Supabase
    seedExercises.js      — демо-упражнения при пустом справочнике
    admin/                — сервисы админки: клиенты, журнал, статистика клуба, организация, поиск, hydrate
  pages/
    Login.jsx
    admin/                — AdminDashboard (вложенные роуты), AdminClients, AdminStatistics, AdminOrganization, AdminExercises, AdminClubStatsSection
    trainer/              — TrainerHome, TrainerDashboard, TrainerClients, ClientCard, ClientOverview, TrainingPage, Statistics, TrainerProfile
  components/             — ClientDiaries, MembershipManager, TrainingForm, AppHeader, DraftTabsBar, …
supabase/
  schema.sql              — эталонная схема Postgres под приложение (новый проект)
  migrations/*.sql        — идемпотентные изменения для существующих БД
  functions/              — Edge: create-trainer, delete-trainer
  policies_admin_example.sql — пример RLS (не автоприменяется)
docs/
  README.md               — карта всей документации (начать здесь для навигации)
  DEPLOY.md               — первый деплой в интернет
  RELEASE.md              — чеклист релиза на production
  RUNBOOK.md              — типовые инциденты (sync, PWA, статистика, клубы)
  SUPABASE_PROD_CHECKLIST.md — Auth, RLS, users.id перед крупным клубом
  COMMERCIAL_ROADMAP.md   — фазы 0–4, что сделано / ongoing
  DATA_VOLUME.md          — SQL оценка объёма, пороги для pull-by-period
  ISKRA_*.md              — ИСКРА: north star, архитектура, dispatch, planerka, learning
  PROJECT_HANDOFF_FOR_AI.md — этот файл
.cursor/rules/
  fitness-diary-architecture.mdc  — всегда: слои, офлайн, без костылей
  fitness-diary-split-files.mdc     — при правках src/api: когда дробить файлы
public/                   — иконки PWA, _redirects (Cloudflare)
netlify.toml, vercel.json — SPA fallback для хостинга
.env.example              — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

---

## 4. Переменные окружения

Все публичные ключи только с префиксом **`VITE_`** (вшиваются в клиент при `vite build`).

- `VITE_SUPABASE_URL` — Project URL  
- `VITE_SUPABASE_ANON_KEY` — anon public key  

Если URL/ключ пустые, содержат плейсхолдер `YOUR_PROJECT` / `YOUR_SUPABASE_ANON_KEY`, или только пробелы — **`isSupabaseConfigured()` === false`**: приложение работает в **локальном режиме** (демо-сид, ограниченный функционал облака).

Секреты сервисной роли **никогда** не кладутся во фронт.

---

## 5. Аутентификация и роли

- **`AuthContext`**: `user`, `role` (`'admin' | 'trainer'`), `isAdmin`, `isTrainer`, `loading`, `signIn`, `signOut`, `supabaseReady` (= настроен ли Supabase, не «онлайн ли сеть»).
- **Без Supabase**: вход по логину из `Login.jsx` пишет сессию в `localStorage` (`fitness-diary-auth-fallback`), поднимается демо-пользователь; вызывается `ensureDemoData()`.
- **С Supabase**: `signInWithPassword`, профиль из таблицы `users` (`role`, `name`, `club_id` при наличии колонки).

**Маршрутизация** (`App.jsx`):

- `/login` — без layout.
- Остальное внутри `LoggedInLayout` (шапка, черновики, breadcrumbs, `<Outlet />`).
- **`RoleOutlet`**: дети доступны только если `roles.includes(role)`; иначе редирект на `/admin` или `/trainer`.

Пути:

- Тренер: `/trainer`, `/trainer/clients`, `/trainer/clients/:id` (**ClientCard**), `/trainer/workouts/:id` (**TrainingPage**), `/trainer/profile`.
- Админ: `/admin` (**AdminDashboard** с вложенными `clients`, `statistics`, `organization`, `exercises`, …), `/admin/clients/:id` (**тот же ClientCard**), `/admin/workouts/:id` (**TrainingPage**).
- Редиректы совместимости: `/admin/diaries` → клиенты; старые `trainers`/`clubs` → organization.

---

## 6. Модель данных (логическая)

### IndexedDB (`localDb.js`)

Хранилища: `meta`, `clients`, `memberships`, `trainings`, `exercises`, `body_measurements`, `health_cards` (**keyPath: `client_id`**), `clubs`, `sync_queue`.

Важно: **`health_cards`** в IDB ключуется по **`client_id`**, не по `id` записи.

### Основные сущности

- **clients**: `trainer_id`, `club_id`, имя, телефон, `birth_date`, `card_number`, …
- **memberships**: период `start_date`/`end_date`, `total_trainings`, `used_trainings`, `club_id`, `client_id`; поле `status` в схеме Postgres может быть, **логика «активности» в приложении** опирается на `membershipRules` (даты + остаток тренировок), не на `status`.
- **trainings**: `client_id`, `trainer_id`, `club_id`, `date`, `type`, `status` (`draft` | `completed`), `data` (JSONB) — структура формы из `TrainingForm`.
- **health_cards**: в т.ч. `height_cm`, `weight_kg`, `goal`, тексты медкарты; синк с облаком; если в Postgres нет колонки `goal`, `flushSyncQueue` повторяет запись **без** `goal` (см. `syncService.js`).
- **body_measurements**: поля как в `BODY_MEASURE_FIELDS` (`neck`, `chest`, `arm_r`, …); `getMeasureValue` умеет читать legacy-имена (`arm`, `waist`, …).

### Синхронизация (`syncService.js`)

- `saveLocalWithSync(store, record, { table_name, operation, remote_id })` — запись в IDB + очередь `sync_queue`.
- `flushSyncQueue()` — при онлайне и настроенном Supabase шлёт insert/update/delete в таблицы из `ALLOWED_TABLES`.
- Удаление медкарты: `deleteHealthCardByClientId` — в IDB ключ `client_id`, в очереди delete по `remote_id` = `hc.id`.

---

## 7. Ключевая бизнес-логика (коротко)

- **Новая тренировка**: тренер с `clientId` в query; **админ** не создаёт новую с нуля (`TrainingPage` early return + текст в `ClientCard`).
- **Списание абонемента** при первом переводе в `completed`: `pickUsableMembershipForDate`, дата для тренера — **«сегодня»** (`todayIso`), для админа — **`trainingDate`** (см. комментарии в `TrainingPage`).
- **`club_id`** у тренировки обязателен; при отсутствии у клиента — эвристики из абонемента / первого клуба (`TrainingPage` + `persist`).
- **Тренер без `club_id` в профиле**: `listLocalClients` / `listTrainingsForTrainer` с пустым `trainerClubId` возвращают **[]** — дашборд пустой (задуманная политика).
- **Админ, список клиентов в облаке без выбранного клуба**: `listAdminClientsForClub` может вернуть пусто + `cloudNeedsClub` (см. `adminClientsListService.js`).
- **Поиск клиентов (админ)**: два поля — клиент и тренер; отдельный сервис `adminClientSearchService.js` (журнал и т.п.) с поиском по ФИО тренера при Supabase.

---

## 8. Статистика клуба (`adminClubStatsService.js` + `AdminClubStatsSection`)

При выбранном `clubId` и диапазоне дат (**период сводки**):

- всего клиентов клуба;
- «действующие» — `hasUsableMembershipOnDate(..., dateTo)`;
- «не активные» — на `dateTo` нет действующего абонемента (причина: `inactiveMembershipReason`);
- проведённые тренировки — `status === 'completed'` в диапазоне;
- по типам карт, по дням, рейтинг тренеров — в том же периоде.

**Итоговый годовой график** («Итог по клубу»): **полный календарный год** (янв–дек), **не зависит** от периода сводки; только завершённые со **типом карты** на абонементе.

Доменные правила: `membershipRules.js`, agg: `api/lib/clubStatsAgg.js`, `clubMonthlyAgg.js`. Verify: `verify-club-client-period.mjs`, `verify-club-monthly-year.mjs`.

UI: карточки, drill-down, пояснения в popover (Info).

---

## 9. Карточка клиента (`ClientCard` + `ClientOverview`)

Вкладки: **Здоровье** (медкарта + обмеры + цель), **Абонементы**, **Тренировки**, **Статистика**.

Цель хранится в **`health_cards.goal`**; миграция Postgres: `supabase/migrations/20260513120000_health_cards_goal.sql`.

---

## 10. Edge Functions

- `supabase/functions/create-trainer` — вызывается из админки организации (`supabase.functions.invoke`).
- `supabase/functions/delete-trainer` — через `adminOrganizationService.js`.

Деплой: Supabase CLI `supabase functions deploy …` (см. `docs/DEPLOY.md`).

---

## 11. Сборка, качество, деплой

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Разработка |
| `npm run build` | Артефакт в `dist/` |
| `npm run preview` | Локальный просмотр production-сборки |
| `npm run lint` | ESLint |
| `npm run qa:local` | build + verify-скрипты + lint (без prod smoke) |
| `npm run qa` | qa:local + prod smoke |
| CI | `.github/workflows/qa.yml` — `qa:local` на push/PR; `qa-prod-weekly.yml` — prod smoke по понедельникам |
| `npm run gen:icons` | Регенерация `public/icons` |

Деплой статики и Supabase: **`docs/DEPLOY.md`**. Конфиги: `netlify.toml`, `vercel.json`, `public/_redirects`.

---

## 12. Известные ограничения / неочевидности

1. **`supabase/schema.sql` vs миграции**: для нового проекта можно выполнить `schema.sql` в SQL Editor, затем миграции (идемпотентны). Не смешивать бездумно два «источника правды» на одной БД без понимания порядка.
2. **RLS**: в репозитории только пример; на проде политики обязательны.
3. **Имена тренеров без Supabase**: `listTrainerSummariesForAdmin` возвращает `[]` — поиск/отображение ФИО тренера в облачных фичах ограничены.
4. **PWA кэш**: в dev SW отключён (`vite-plugin-pwa` `devOptions`), чтобы не было «белого экрана» из кэша.
5. **Чанк JS** крупный — предупреждение Vite при build, не ошибка.

---

## 13. Как продолжить работу другой модели

1. Прочитать этот файл; навигация по docs — **`docs/README.md`**. При необходимости — **`docs/DEPLOY.md`**.
2. Для изменений UI/логики — искать по `src/pages`, `src/components`, `src/lib`.  
3. Для схемы БД — `supabase/schema.sql` и `supabase/migrations/`.  
4. После правок: **`npm run lint`**; при sync/статистике/абонементах — **`npm run qa:local`**.  
5. Не добавлять секреты сервисной роли во фронт; для новых таблиц синка — расширить `PUSH_ALLOWED_TABLES` (`api/lib/pushRecordCore.js`) и путь в `flushSyncQueue`, если таблица должна синхронизироваться.

---

## 14. Контакты с пользователем

Пользователь предпочитает **русский** язык в ответах. Даты в UI часто через **`formatDateRu`** / периоды через **`src/lib/period.js`**.

Файл можно копировать целиком в системный промпт или первое сообщение новому ассистенту вместе с указанием корня репозитория: `fitness-diary`.

**Правила для Cursor (агент подхватывает автоматически):** каталог `.cursor/rules/`

| Файл | Когда |
|------|--------|
| `fitness-diary-features.mdc` | всегда — **новая фича**: исход, код, wow, стабильность |
| `fitness-diary-architecture.mdc` | всегда — офлайн, слои |
| `fitness-diary-scale.mdc` | всегда — масштаб, verify |
| `fitness-diary-stability.mdc` | всегда — не ломать критические сценарии |
| `fitness-diary-ship.mdc` | всегда — QA, деплой, коммит |
| `fitness-diary-split-files.mdc` | `src/**`, `api/**` |
| `fitness-diary-domain.mdc` | абонементы, статистика, agg |
| `fitness-diary-sync.mdc` | sync, очередь, pull |
| `fitness-diary-supabase.mdc` | `supabase/**`, API |
| `fitness-diary-ui.mdc` | pages, components, CSS |

Принцип: новую логику сразу в правильный слой/файл; wow — отдельным предложением, не костылём в PR.

---

## 15. Клубы: приложение ≠ Supabase

Симптомы (фантомные клубы в UI, «Сохраняем…», `ERR_CONNECTION_RESET`, 403 на clubs): **[RUNBOOK.md §3](./RUNBOOK.md)** и **[SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md)**.

Код: `AdminOrganization.jsx` → `saveClubForAdmin` / `pullClubsFromSupabaseInner` в `dataAccess.js`; RLS — миграции `20260518120000_clubs_rls_admin.sql`, `20260519120000_fit_auth_admin_by_email.sql`.
