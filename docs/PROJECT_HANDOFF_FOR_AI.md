# Описание проекта для передачи другой нейросети / разработчику

**Актуально:** 2026-08-13. Документ самодостаточен: по нему можно продолжить работу без истории чата. Язык UI — **русский**. Репозиторий: **fitness-diary**. Продукт: **Ядро** (код `CORE`). Клуб-эталон: **FIT-CITY** (тенант, не имя системы). Канон: [BRAND_SYSTEM.md](./BRAND_SYSTEM.md).

**Сначала:** крупная цель [PRODUCT_VISION.md](./PRODUCT_VISION.md) → нарезка и ведение [PATH_TO_GOAL.md](./PATH_TO_GOAL.md) → этот файл (что в коде сегодня) → карта [README.md](./README.md) → при углублении [API.md](./API.md), [SYNC.md](./SYNC.md), [DATA_MODEL.md](./DATA_MODEL.md), [TESTING.md](./TESTING.md), [PWA.md](./PWA.md). Уровень инженерии: [ENGINEERING_MATURITY.md](./ENGINEERING_MATURITY.md). Оплаты: [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md) — ТЗ готово; **код L3/кассы — после стабильного переезда РФ (R3+)**. Модули: [PRODUCT_MODULES.md](./PRODUCT_MODULES.md).

**Роль агента:** вести процесс к конечной цели (ритуал и очередь ставок — PATH_TO_GOAL §4–5); владельцу — кабинеты, оплата, пароли, явные go/no-go. Правило: `.cursor/rules/fitness-diary-north-star-lead.mdc`.

Правила кода для Cursor — `.cursor/rules/` (политика). Этот handoff — **нарратив**: что за продукт и куда смотреть. Не дублировать политику целиком.

**Хостинг:** сейчас Vercel + Supabase. Переезд на **российские серверы — в будущем** (курс C2 + Yandex). **R1 prep в коде (2026-08-09):** portable `server/` + Docker + `db:migrate:pg` (stub `auth.*`) + `/api/health` + шов Auth — [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md), [AUTH_C2_MAP.md](./AUTH_C2_MAP.md). День 1 R2 = **hybrid** (хост на РФ, данные пока Supabase). Прод не переключали. Стенд R2 / cutover — только по явной команде. Портативность — [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md), правило `fitness-diary-hosting-portability.mdc`. Стек / TypeScript vs переезд — STRATEGY **§5.9**.  
**Безопасность (усиление):** ⏸ после РФ — STRATEGY §5.7; до cutover не кодить rate limit / админ-email без команды. Гигиена в фичах — `fitness-diary-security.mdc`.

---

## 1. Назначение продукта

**Тип (крупная цель):** операционная система и **CRM** фитнес-клуба; **конечная цель** — заменить 1С в ежедневной работе клуба (не полный ERP-завод). Зал + продажи + управление + учёт оплат; снаружи сайт заявок и касса; сверху ИСКРА. Новые фичи — через **проекцию цели**. Полная формулировка, слои L0–L4: [PRODUCT_VISION.md](./PRODUCT_VISION.md).

**Сейчас в проде** — PWA для **тренеров** (планшет, офлайн), **админов**, **менеджеров по продажам** и **управляющих** (`/club`):

- клиенты, абонементы, тренировки (черновик → завершена);
- медкарта, обмеры, цель; **питание** и **ДЗ** (домашние задания);
- воронка **ПНК** (потенциальный новый клиент): менеджер создаёт → тренер ведёт мастер на карточке;
- справочник упражнений, челленджи;
- организация: клубы, тренеры, менеджеры продаж, **управляющие** (вкладки Структуры не смешивать);
- **lite-ПЗ:** клиенты тренеров без планшета — лёгкая карточка у админа и менеджера продаж (карта/абон); см. [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md);
- статистика клуба, продажи / финансы, **ИСКРА** (AI-советник админки), качество ведения;
- офлайн: **IndexedDB** + **очередь sync** → `/api/push-record(s)` → pull (`trainer-pull`, `admin-data`).

Production: https://fitness-diary-bice.vercel.app

---

## 2. Технологический стек

| Слой | Технология |
|------|------------|
| UI | React 19, React Router 7 |
| Сборка | Vite 6, `@vitejs/plugin-react` |
| PWA | `vite-plugin-pwa` (SW в production) |
| Бэкенд | Supabase (Postgres, Auth) + **Vercel serverless** `api/*.js` |
| Локальное хранилище | `idb` → `src/lib/localDb.js` (версия IDB **16**) |
| Стили | `src/index.css`, `src/styles/` |
| AI | Gemini через `admin-data?action=gemini-analytics` (ключ только на сервере) |
| Push | Web Push (VAPID) для планёрки / заданий |
| Линт | ESLint 9, `npm run lint` |

**TypeScript нет** — только `.js` / `.jsx`.

---

## 3. Структура каталогов (важное)

```
src/
  App.jsx                 — маршруты, RoleOutlet (admin | trainer | sales_manager | supervisor)
  context/AuthContext.jsx — сессия, роль, isAdmin / isTrainer / isSalesManager / isSupervisor
  lib/
    localDb.js, syncService.js, syncApiClient.js, syncHeaderPullService.js, membershipRules.js
    dataAccess.js         — реэкспорты; новое админское — в admin/
    admin/                — статистика, продажи, организация, ИСКРА-клиент, multi-hall / desk
    pnk/                  — этапы ПНК, wizard, glance, visit quality (*Core.js)
    trainer/              — статистика тренера, pull-хелперы
    hr/                   — BLE пульс в общей шапке, до 2 слотов (см. docs/TRAINING_HR.md)
  pages/
    admin/                — дашборд, клиенты, статистика, Sales*, ИСКРА, челленджи, deletion-log,
                            call-log (журнал связи), ClubSupervisor* (кабинет `/club`)
    trainer/              — home, clients, ClientCard, TrainingPage, profile
  components/pnk/         — UI воронки ПНК
api/
  *.js                    — тонкие handlers (лимит Hobby ≤12 functions)
  _lib/                   — ядро: pushRecordCore, *Agg, adminData/*, iskra*, …
server/                   — portable host + /api/health (prep R2 / РФ)
supabase/
  schema.sql, migrations/, functions/ (legacy create-trainer / delete-trainer — прод через api/)
docs/                     — карта в README.md
.cursor/rules/            — architecture, sync, domain, ship, features, adult-app, …
scripts/                  — agent-qa.mjs, verify-*.mjs
```

**Важно:** серверный код — **`api/_lib/`**, не `api/lib/`.

---

## 4. Переменные окружения

Публичные (фронт, префикс **`VITE_`**):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (JWT `eyJ…`, не `sb_publishable_…`)
- опционально `VITE_VAPID_PUBLIC_KEY`, `VITE_ADMIN_EMAILS`

Только сервер (Vercel / Edge, **без** `VITE_`):

- `SUPABASE_SERVICE_ROLE_KEY`, опционально `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`, опционально `GEMINI_MODEL`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- клубные SMS и звонки «Мои Звонки»: **сначала** `club_iskra_settings.moizvonki` на клуб (Структура → Max и SMS); запасной общий `MOIZVONKI_*` в env; журналы `club_sms_log` / `club_call_log` — [MOIZVONKI_SETUP.md](./MOIZVONKI_SETUP.md)

См. `.env.example`. Без URL/ключа Supabase — локальный демо-режим.

---

## 5. Аутентификация и роли

- **`AuthContext`**: `role` ∈ `'admin' | 'trainer' | 'sales_manager' | 'supervisor'`; флаги `isAdmin`, `isTrainer`, `isSalesManager`, `isSupervisor`.
- После входа: admin → `/admin`, sales_manager → `/sales`, supervisor → `/club`, иначе → `/trainer`.
- Staff-списки: `GET /api/list-trainers` без param → **тренеры**; `?role=sales_manager` / `?role=supervisor` — вкладки «Менеджеры» / «Управляющие» (не путать).

| Роль | Основные маршруты |
|------|-------------------|
| trainer | `/trainer`, `/trainer/clients`, … |
| sales_manager | `/sales`, `/sales/clients`, `/sales/club-tasks`, `/sales/pnk`, `/sales/deletion-log`, `/sales/call-log` |
| supervisor | `/club/*` (клиенты, **call-log**, статистика, продажи, ПНК, челленджи, планёрка, settings=Max/SMS) |
| admin | `/admin/*` (clients, **deletion-log**, **call-log**, **excel-lists**, statistics, sales, pnk, challenges, club-tasks, structure?tab=… в т.ч. **trainers / sales-managers / supervisors** / diagnostics / iskra-settings, …), `/admin/workouts/:id` |
- Без Supabase: fallback в `localStorage`, демо-данные.
- С Supabase: `signInWithPassword` (+ при необходимости `/api/auth-sign-in`), профиль из `users`.

**Маршруты** (`App.jsx`):

| Роль | Пути |
|------|------|
| trainer | `/trainer`, `/trainer/clients`, `/trainer/clients/:id`, `/trainer/workouts/:id`, `/trainer/profile`, челленджи |
| sales_manager | `/sales`, `/sales/clients`, `/sales/club-tasks`, `/sales/pnk`, `/sales/deletion-log`, `/sales/call-log` |
| supervisor | `/club`, `/club/clients`, `/club/call-log`, `/club/statistics`, `/club/sales`, `/club/pnk`, `/club/challenges`, `/club/club-tasks`, `/club/settings`, `/club/workouts/:id` |
| admin | `/admin/*` (clients, **deletion-log**, **call-log**, **excel-lists**, statistics, sales, pnk, challenges, club-tasks, structure?tab=… в т.ч. **supervisors** / diagnostics / iskra-settings, …), `/admin/workouts/:id` |

**Multi-hall (фаза 1):** один `client` — абоны ПЗ/ТЗ/АЗ (`memberships.hall`); вкладки списков и карточки; статистика `hall=`. Канон: [CLIENT_MULTI_HALL.md](./CLIENT_MULTI_HALL.md).

**Менеджер и типы АЗ:** справочник `membership_types` (ПЗ + АЗ) нужен для колонок «Тренировки в аэробном зале». Доступ: RLS `fit_membership_types_sales_manager_read` + `admin-data?action=membership-types`. Sync менеджера тянет типы; на отчёте — ещё «Обновить». Подробнее: [SALES_MANAGER.md](./SALES_MANAGER.md), [SYNC.md](./SYNC.md).

Карточка клиента (`ClientCard`) общая для тренера и админа.

**Главная админа / менеджера / управляющего:** ряд «внимание» — `AdminHomeAttentionRow`. Управляющий: [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md) (миграция `20260805220000_users_supervisor_role.sql`). Куратор сети — позже ([ISKRA_CURATOR.md](./ISKRA_CURATOR.md)).

---

## 6. Модель данных и sync (кратко)

Полнее: [DATA_MODEL.md](./DATA_MODEL.md), [SYNC.md](./SYNC.md).

**IDB stores (v16):** `meta`, `clients`, `memberships`, `trainings`, `exercises`, `body_measurements`, `health_cards` (**keyPath: `client_id`**), `clubs`, `sync_queue`, `challenges`, `membership_types`, `nutrition_products`, `homework_presets`, `client_weight_entries`, `outreach_log`, `club_iskra_settings` (кэш шаблонов outreach; **не** полный `moizvonki` с ключом), `pnk_funnel_events`, `sale_clips`.

Настройки **качества ведения** и **плана ЗП** — Postgres + `admin-data`, **без** offline-store в IDB. Полнее: [DATA_MODEL.md](./DATA_MODEL.md).

**Поток записи:** UI → `saveLocalWithSync` → IDB + `sync_queue` → при online `/api/push-record` или `push-records` → ручной Sync: **сначала flush очереди**, потом **pull**. Pull не затирает строки с pending (`putStoreUnlessPendingSync`).

**Allowlist push:** `PUSH_ALLOWED_TABLES` в `api/_lib/pushRecordCore.js`.

**Лояльность ПЗ:** `admin-data?action=loyalty-settings|loyalty-account|loyalty-glance|loyalty-redeem|loyalty-journal`. Маршруты `/admin/loyalty`, `/sales/loyalty`. Структура `?tab=loyalty` (тумблер и ставки клуба, POST только admin). Таблицы не в очереди sync. IDB store `loyalty_glance` (v17). Карточка: вкладка «Баллы» + кнопка списать (sales/admin, только в сети). Архив/переезд клуба: ledger пишет сервер после успешного push `clients` (не очередь). Канон: [LOYALTY.md](./LOYALTY.md).

Продажи / ПНК / ИСКРА на сервере часто идут через **`admin-data?action=`**, не только через очередь планшета.

**⏸ Backlog:** админ online-first (запись сразу в API, Sync не обязателен) — [SYNC.md](./SYNC.md) § «админ без обязательного Sync»; тренера не ломать.

---

## 7. Ключевая бизнес-логика

- **Новая тренировка:** тренер с `clientId`; админ с нуля не создаёт.
- **Списание абонемента** при первом `completed`: `membershipRules` / `pickUsableMembershipForDate`; дата для тренера — «сегодня», для админа — дата тренировки.
- **`club_id`** у тренировки обязателен; тренер без `club_id` в профиле видит пустые списки.
- **ПНК:** жизненный цикл на клиенте + абонемент БЗ; логика в `src/lib/pnk/*Core.js`; UI мастер + доска `/sales/pnk`. Док: [PNK_FUNNEL.md](./PNK_FUNNEL.md).
- **Архив клиентов:** [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) — не ломать sync/agg.

---

## 8. Статистика клуба

Период сводки ≠ годовой график (полный календарный год).  
Agg: `src/lib/admin/*Agg.js` ↔ зеркало `api/_lib/*Agg.js` + `scripts/verify-*.mjs`.  
UI: карточки, drill-down. Домен: `.cursor/rules/fitness-diary-domain.mdc`.  
**Качество ведения** (care / depth / хвосты ДК+БЗ): [COACH_QUALITY.md](./COACH_QUALITY.md) — статистика + настройка весов/тумблеров в **Структура → Качество ведения**.

**Удержание клиента** (фаза 0 — core + verify): [CLIENT_RETENTION.md](./CLIENT_RETENTION.md) — cohort M+3, renewal, archive/reactivation; отдельно от CQ и period census.  
**План ЗП тренеров:** пороги тренировок месяца (ур. 2 / 3) — **Структура → План ЗП**; ставки ₽ и галочка **«В план»** (`counts_toward_pay_plan`) — **Типы абон.** (`trainer_pay_l1/l2/l3`); кабинет сотрудника (с планом / без плана + ±₽ за тренировку) — **Структура → Тренеры → кабинет** (иконка кошелька). Расчёт ЗП: уровень из порогов+профиля по типам с галочкой «В план» × ставка типа + adjustment (не ниже 0; карта с оплатой 0 — без adj). Без флага в старом кэше — фолбэк «ставка > 0». **Прошлый календарный месяц** — по снимку правил (`club_trainer_pay_month_snapshots`), текущий — live. **Дневной отчёт / статистика «по типам карт»:** колонки База + Итого ЗП (`trainerDayPayrollForecastCore` / `trainerPeriodPayrollForecastCore`); без плана — сценарии L1–L3 в ячейке. **Прогноз чистой:** ЗП ПЗ к концу месяца — `trainerMonthPayrollForecastCore` (прогнозный уровень × часы + adj), не замороженная средняя MTD.  
Главная = **glance** (session last-good + фоновая перепроверка с debounce 25 с для ПНК, `homeGlanceCache`: CQ, продажи, сводка дня, presence ПНК/планёрки); экран статистики = **detail** (всегда свежий `coach-quality`, без glance-TTL). **ПНК на главной:** после доски — event без второго refetch; сеть не чаще 25 с (закладка под ×10 клубов).

---

## 9. Карточка клиента

Вкладки: **Здоровье**, **Питание**, **ДЗ**, **Абонементы**, **Тренировки**, **Статистика**; для открытого ПНК — мастер шагов и ограничения видимости вкладок (`pnkStagesCore`).  
Сводка клиентов: плитка **ДР сегодня** считает только сегодня; по клику — сегодня + ближайшие 30 дней (`clientBirthdays.js`, блоки «Сегодня» / «Ближайшие»).

Цель — в `health_cards.goal`.

---

## 10. API (Vercel serverless)

Каталог endpoints: [API.md](./API.md).

- Vercel: `admin-data`, `trainer-pull`, `push-record(s)`, auth, list-*, **`create-trainer`**, `update-trainer-club`, …
- Удаление тренера: `admin-data?action=delete-trainer` (не отдельный `api/*.js`).
- Hobby **≤12** `api/*.js` — новое действие → `admin-data?action=`, не новый файл.
- Edge Functions в `supabase/functions/` — **legacy**; прод ходит в `/api/*` (см. [DEPLOY.md](./DEPLOY.md)).

---

## 11. Сборка, качество, деплой

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Разработка (Vite) |
| `npm run dev:vercel` | Локально Vite + serverless `api/` |
| `npm run build` / `preview` | Production-сборка |
| `npm run lint` | ESLint — **всегда** перед «готово» |
| `npm run qa:local` | build + verify из `agent-qa.mjs` + lint (без prod smoke) |
| `npm run qa` | + prod smoke |
| `npm run qa:deep` / `qa:roles` | углублённые / ролевые проверки |
| `npm run check:volume` | объём данных (см. DATA_VOLUME) |
| `npm run db:migrate*` / `db:migrate:pg` | policies, sales, pnk, iskra, portable PG… |
| `npm start` | portable host (см. R2 runbook) |

Подробнее: [TESTING.md](./TESTING.md), [RELEASE.md](./RELEASE.md), [DEPLOY.md](./DEPLOY.md).  
CI: `.github/workflows/qa.yml` (`qa:local`), weekly prod smoke.

---

## 12. Известные ограничения

1. `schema.sql` + идемпотентные `migrations/` — понимать порядок на новой БД.
2. RLS на проде обязателен ([SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md)).
3. PWA SW в dev обычно выключен — иначе риск «белого экрана» из кэша ([PWA.md](./PWA.md)).
4. Инциденты клубы ≠ облако: [RUNBOOK.md](./RUNBOOK.md) §3.

---

## 13. Как продолжить работу другой модели

1. Этот handoff + [docs/README.md](./README.md).
2. Код: `src/pages`, `src/components`, `src/lib`, `api/_lib`.
3. Схема: `supabase/schema.sql`, `migrations/`.
4. После правок: `npm run lint`; sync/статистика/абонементы/agg → `npm run qa:local`.
5. Новая таблица в sync: migration + RLS + `PUSH_ALLOWED_TABLES` + flush/pull + store в `localDb` при офлайн-кэше.
6. Фича shipped → обновить статус в doc + строку в README (см. ship-правило).

---

## 14. Контакты с пользователем

Ответы на **русском**, простым языком. Даты UI: `formatDateRu`, периоды — `src/lib/period.js`.

---

## 15. Правила Cursor

| Файл | Когда |
|------|--------|
| `fitness-diary-north-star-lead.mdc` | конечная цель (1С→Ядро CRM) + агент ведёт процесс |
| `fitness-diary-features.mdc` | новая фича: фильтр → исход → код → wow → стабильность |
| `fitness-diary-architecture.mdc` | слои, офлайн |
| `fitness-diary-scale.mdc` | масштаб, verify |
| `fitness-diary-stability.mdc` | критические сценарии |
| `fitness-diary-security.mdc` | безопасность: auth, секреты, push/RLS, удалённые угрозы |
| `fitness-diary-ship.mdc` | QA, деплой, коммит |
| `fitness-diary-docs.mdc` | документация как DoD: правда, слои, без drift |
| `fitness-diary-file-structure.mdc` | как пишем файлы (структура с первого коммита) |
| `fitness-diary-split-files.mdc` | пороги разбиения уже больших файлов |
| `fitness-diary-domain.mdc` | абонементы, статистика |
| `fitness-diary-sync.mdc` | очередь, pull |
| `fitness-diary-supabase.mdc` | миграции, секреты, ≤12 functions |
| `fitness-diary-ui.mdc` | планшет, русский UX, ПНК UI |
| `fitness-diary-cursor-efficiency.mdc` | экономия контекста, понятные отчёты |
| `fitness-diary-adult-app.mdc` | взрослое приложение: не наращивать костыли |
| `fitness-diary-fix-comprehensive.mdc` | багфикс по всему контуру данных |
| `fitness-diary-hosting-portability.mdc` | закладки под переезд на РФ |

---

## 16. Клубы: приложение ≠ Supabase

Симптомы и фиксы: [RUNBOOK.md §3](./RUNBOOK.md), [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).
