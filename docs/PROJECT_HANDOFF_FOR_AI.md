# Описание проекта для передачи другой нейросети / разработчику

Документ самодостаточен: по нему можно продолжить работу без доступа к истории чата. Язык интерфейса пользователя — **русский**. Репозиторий: **fitness-diary** (PWA «дневник тренировок» для фитнес-клуба, бренд в UI — FIT-CITY).

---

## 1. Назначение продукта

Веб-приложение для **тренеров** и **администраторов** клуба:

- ведение **клиентов**, **абонементов**, **тренировок** (черновик → завершена);
- **медкарта** (карта здоровья), **обмеры**, **цель** клиента;
- **справочник упражнений** (админ);
- **организация**: клубы, тренеры (в т.ч. Edge Functions создания/удаления тренера);
- **статистика по клубу** (админ, при выбранном клубе): клиенты, абонементы, непродления, тренировки;
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
  DEPLOY.md               — первый деплой в интернет
  PROJECT_HANDOFF_FOR_AI.md — этот файл
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

При выбранном `clubId` и диапазоне дат:

- всего клиентов клуба;
- «действующие» — `hasUsableMembershipOnDate(..., dateTo)`;
- «не продлилось» — был абонемент с `end_date` в диапазоне, на `dateTo` нет действующего;
- проведённые тренировки — `status === 'completed'` в диапазоне.

UI: вкладки/карточки, пояснения в popover по кнопке Info.

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

1. Прочитать этот файл и при необходимости **`docs/DEPLOY.md`**.  
2. Для изменений UI/логики — искать по `src/pages`, `src/components`, `src/lib`.  
3. Для схемы БД — `supabase/schema.sql` и `supabase/migrations/`.  
4. После правок: **`npm run build`** и **`npm run lint`**.  
5. Не добавлять секреты сервисной роли во фронт; для новых таблиц синка — расширить `ALLOWED_TABLES` и путь в `flushSyncQueue`, если таблица должна синхронизироваться.

---

## 14. Контакты с пользователем

Пользователь предпочитает **русский** язык в ответах. Даты в UI часто через **`formatDateRu`** / периоды через **`src/lib/period.js`**.

Файл можно копировать целиком в системный промпт или первое сообщение новому ассистенту вместе с указанием корня репозитория: `fitness-diary`.

---

## 15. Инцидент: клубы в приложении ≠ клубы в Supabase (май 2026)

**Статус на момент handoff:** RLS и `public.users.id` пользователь **исправил в SQL**, но в браузере по-прежнему **`ERR_CONNECTION_RESET`**, **`ERR_HTTP2_PING_FAILED`**, **`[auth] profile load failed`**, кнопка «Создать клуб» зависает на **«Сохраняем…»**, в UI — фантомные дубликаты **«Нон-стоп»**, в Table Editor — только **FIT-CITY Клинцы** (пользователь подтвердил: создан через приложение, когда связь работала).

### 15.1. Инфраструктура

| Параметр | Значение |
|----------|----------|
| Production URL | https://fitness-diary-bice.vercel.app |
| Supabase project ref (из кода/доков) | `hrylzinyasucjecltxpc` |
| Project URL | `https://hrylzinyasucjecltxpc.supabase.co` (без `/rest/v1/` в env) |
| Anon key | JWT `eyJ…` (anon public), **не** `sb_publishable_…` |
| Админ Auth | `admin@fit-city.ru` |
| Auth UID (Authentication → Users) | `b6a3743e-b788-467e-b4bc-aed14a4b175a` |
| `public.users` после UPDATE | `id` = тот же UID, `role` = `admin`, `is_active` = true |

**Vercel env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — после смены обязателен **Redeploy**. Локально — `.env` (gitignore). В git **много незакоммиченных** правок (`main` ahead 2 + modified files).

### 15.2. Архитектура данных для клубов

```
Админка → AdminOrganization.jsx (clubSubmit)
    → saveClubForAdmin() в dataAccess.js
        1) INSERT/UPDATE в Supabase (clubs)
        2) при успехе — putStore('clubs') в IndexedDB
        3) при сетевой ошибке — только IDB + enqueueSync (insert/update clubs)
    → reloadClubsList({ forcePull })
        → pullClubsFromSupabase()
            upsert клубы из облака
            prune: удалить локальные id, которых нет в remote (кроме pending insert в sync_queue)
```

**Разрыв «UI admin» vs «RLS admin»:**

- `AuthContext.resolveRole()` даёт **admin** по email `admin@fit-city.ru` / кэшу / metadata, даже если `users` не загрузился.
- Postgres RLS для INSERT/DELETE в `clubs` — только `fit_auth_is_admin()` (см. миграции ниже).
- SELECT в `clubs` — **всем authenticated** (`USING (true)`), поэтому список из облака читается, а запись может падать.

### 15.3. Миграции Supabase (клубы + RLS)

| Файл | Содержание |
|------|------------|
| `20260518120000_clubs_rls_admin.sql` | RLS на `clubs`: SELECT authenticated; ALL для admin через `fit_auth_is_admin()` |
| `20260519120000_fit_auth_admin_by_email.sql` | `fit_auth_is_admin()` = по `u.id = auth.uid()` **или** по `lower(u.email) = lower(jwt email)` |

**Пользователь выполнил в SQL Editor:** обе миграции +  
`UPDATE public.users SET id = 'b6a3743e-b788-467e-b4bc-aed14a4b175a' WHERE email ILIKE 'admin@fit-city.ru';`

### 15.4. Что меняли в коде (сессия отладки, не всё в git)

| Область | Файлы | Суть |
|---------|-------|------|
| Создание клуба | `dataAccess.js` → `saveClubForAdmin` | Раньше только `saveLocalWithSync` + очередь (insert clubs **выкидывался**); теперь прямой INSERT в Supabase |
| Удаление клуба | `deleteClubForAdmin` | Сначала DELETE в облаке с `.select('id')`, потом IDB; если уже нет в облаке — убрать локально |
| Pull / prune | `pullClubsFromSupabaseInner` | Удаление «лишних» локальных клубов; не трогать id из `sync_queue` insert |
| Очередь синка | `syncService.js` | `clearPoisonedSyncQueue` больше **не** удаляет insert clubs; flush с `force: true` может слать insert clubs |
| Retry / timeout | `supabaseRetry.js` | `withSupabaseRetry`, `withFastTimeout(8000)`, `assertSupabaseOk` |
| UI админки | `AdminOrganization.jsx` | `reloadClubsList`, «Убрать из кэша», блокировка двойного submit, сообщения remoteOk |
| Auth | `AuthContext.jsx` | Роль по email если profile не грузится; warn если `users.id ≠ auth.uid` |
| Supabase client | `supabase.js` | Валидация `eyJ` vs `sb_publishable_` |

**Деплои на Vercel:** несколько `npx vercel --prod` (последний bundle ~ `index-C-6fM_D3.js` / `index-BiIgy5RY.js` — смотреть в Network).

### 15.5. История симптомов (хронология)

1. Клубы **удалялись только локально**, в облаке оставались → исправлен порядок delete + проверка строк.
2. Сообщение «удалён в облаке» при 0 строк DELETE → добавлен `.select('id')`.
3. После create **forcePull сразу удалял** новый клуб из IDB (не было в remote) → `saveClubForAdmin` + не делать forcePull при `remoteOk: false`.
4. **403** на POST clubs при `users.id ≠ auth.uid()` → миграция by email + UPDATE id.
5. **Сейчас:** даже после SQL, в консоли **`GET …/clubs` → `net::ERR_CONNECTION_RESET`**, **`profile load failed` (Failed to fetch)** — запросы **не доходят стабильно** до API; UI зависает на «Сохраняем…» (таймаут 8s × retry).

**Важно:** FIT-CITY Клинцы в облаке — доказательство, что приложение **умеет** писать в `clubs`, когда сеть + RLS в порядке. Текущий блокер — не только RLS.

### 15.6. Текущее состояние UI (последний скрин пользователя)

- Список: 2× «Нон-стоп» (локальный кэш, вероятно два failed create с разными UUID), 1× FIT-CITY (из облака).
- Кнопка **«Сохраняем…»** — `clubBusy` до завершения `saveClubForAdmin` (до ~16s+ при retry).
- Консоль: красные GET к `hrylzinyasucjecltxpc.supabase.co`, иногда `200 (OK)` + `ERR_CONNECTION_RESET` (особенность Chrome/HTTP2).
- Жёлтый `[auth] profile load failed` — `refreshProfile` → `users` select не прошёл.

### 15.7. Гипотезы для следующего исследователя (приоритет)

1. **Транспорт / сеть (P0):** VPN, антивирус HTTPS, провайдер, Yandex Browser, корпоративный firewall. Проверить с **другого браузера/сети/устройства**; `curl` к `/rest/v1/clubs?select=id&limit=1` с заголовком `apikey` + `Authorization: Bearer <access_token>`.
2. **Параллельные запросы при открытии Organization (P1):** одновременно `pullClubs`, `refreshProfile`, `listTrainers` — уменьшить нагрузку / serial queue.
3. **PWA / Service Worker (P1):** очистка site data, unregister SW; `PwaUpdatePrompt.jsx` менялся.
4. **Зависание UI (P2):** гарантировать `finally { setClubBusy(false) }`, уменьшить timeout, показывать ошибку раньше; не блокировать форму на весь retry chain.
5. **Дубликаты в IDB (P2):** `listClubsLocal` дедупит по `id`, но два «Нон-стоп» — два разных UUID; нужна очистка или merge.
6. **Vercel env (P2):** убедиться URL без опечатки (`hrylziny` vs `hrylzyny`); в истории был неверный URL → NXDOMAIN.
7. **Supabase project paused / quota** — Dashboard → project health.

### 15.8. Как воспроизвести

1. Войти https://fitness-diary-bice.vercel.app как `admin@fit-city.ru`.
2. Админка → Структура → Клубы.
3. Заполнить форму → «Создать клуб».
4. Ожидание: запись в Table Editor `clubs` + зелёное «создан в облаке».
5. Факт (у пользователя): «Сохраняем…», консоль CONNECTION_RESET, в облаке нет новой строки.

### 15.9. SQL для проверки после фикса

```sql
SELECT id, name, created_at FROM public.clubs ORDER BY created_at DESC;

SELECT id, email, role, is_active FROM public.users WHERE email ILIKE 'admin@fit-city.ru';

-- В браузере под сессией админа INSERT должен проходить; в SQL Editor RLS может вести себя иначе.
```

### 15.10. Рекомендуемые следующие шаги в коде

1. Диагностическая панель на странице клубов: `getSupabaseConfigStatus()`, результат тестового `select` на `users` и `clubs`, Auth UID vs `users.id`.
2. Сериализация начальной загрузки Organization (не 3 параллельных Supabase call).
3. `saveClubForAdmin`: при network error — явное сообщение; опционально Edge Function `admin-upsert-club` (service role на сервере) если RLS/сеть нестабильны (осторожно с безопасностью).
4. Закоммитить все локальные правки в `main` с понятным changelog.
5. После стабилизации сети — удалить фантомные клубы: UI «Убрать из кэша» или SQL по id.

### 15.11. Ключевые фрагменты кода (точки входа)

- Создание: `src/pages/admin/AdminOrganization.jsx` → `clubSubmit` → `saveClubForAdmin`
- Логика облака/кэша: `src/lib/dataAccess.js` (`saveClubForAdmin`, `pullClubsFromSupabaseInner`, `deleteClubForAdmin`)
- Очередь: `src/lib/syncService.js` (`flushSyncQueue`, `clearPoisonedSyncQueue`)
- Роль: `src/context/AuthContext.jsx` (`resolveRole`, `refreshProfile`, `configuredAdminEmails`)
- Клиент: `src/lib/supabase.js`, `src/lib/supabaseRetry.js`
