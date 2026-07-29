# Описание проекта для передачи другой нейросети / разработчику

**Актуально:** 2026-07-19. Документ самодостаточен: по нему можно продолжить работу без истории чата. Язык UI — **русский**. Репозиторий: **fitness-diary**. Продукт: **Ось** (AXIS). Клуб-эталон: **FIT-CITY** (тенант, не имя системы). Канон: [BRAND_SYSTEM.md](./BRAND_SYSTEM.md).

**Сначала:** крупная цель [PRODUCT_VISION.md](./PRODUCT_VISION.md) → этот файл (что в коде сегодня) → карта [README.md](./README.md) → при углублении [API.md](./API.md), [SYNC.md](./SYNC.md), [DATA_MODEL.md](./DATA_MODEL.md), [TESTING.md](./TESTING.md), [PWA.md](./PWA.md). Модули рядом с ядром: [PRODUCT_MODULES.md](./PRODUCT_MODULES.md).

Правила кода для Cursor — `.cursor/rules/` (политика). Этот handoff — **нарратив**: что за продукт и куда смотреть. Не дублировать политику целиком.

**Хостинг:** сейчас Vercel + Supabase. Переезд на **российские серверы — в будущем**; при разработке уже учитывать портативность (env, стабильный `/api/*`, логика в `_lib`) — [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md), правило `fitness-diary-hosting-portability.mdc`. Cutover не делать без явной команды.  
**Безопасность (усиление):** ⏸ после РФ — STRATEGY §5.7; до cutover не кодить rate limit / админ-email без команды. Гигиена в фичах — `fitness-diary-security.mdc`.

---

## 1. Назначение продукта

**Тип (крупная цель):** операционная система фитнес-клуба — зал + продажи + управление + учёт оплат; снаружи позже сайт заявок и касса; сверху ИСКРА. Полная формулировка, слои L0–L4 и «не входит»: [PRODUCT_VISION.md](./PRODUCT_VISION.md).

**Сейчас в проде** — PWA для **тренеров** (планшет, офлайн), **админов** и **менеджеров по продажам**:

- клиенты, абонементы, тренировки (черновик → завершена);
- медкарта, обмеры, цель; **питание** и **ДЗ** (домашние задания);
- воронка **ПНК** (потенциальный новый клиент): менеджер создаёт → тренер ведёт мастер на карточке;
- справочник упражнений, челленджи;
- организация: клубы, тренеры (создание/удаление через API / Edge);
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
| Локальное хранилище | `idb` → `src/lib/localDb.js` (версия IDB **14**) |
| Стили | `src/index.css`, `src/styles/` |
| AI | Gemini через `admin-data?action=gemini-analytics` (ключ только на сервере) |
| Push | Web Push (VAPID) для планёрки / заданий |
| Линт | ESLint 9, `npm run lint` |

**TypeScript нет** — только `.js` / `.jsx`.

---

## 3. Структура каталогов (важное)

```
src/
  App.jsx                 — маршруты, RoleOutlet (admin | trainer | sales_manager)
  context/AuthContext.jsx — сессия, роль, isAdmin / isTrainer / isSalesManager
  lib/
    localDb.js, syncService.js, syncApiClient.js, membershipRules.js
    dataAccess.js         — реэкспорты; новое админское — в admin/
    admin/                — статистика, продажи, организация, ИСКРА-клиент
    pnk/                  — этапы ПНК, wizard, glance, visit quality (*Core.js)
    trainer/              — статистика тренера, pull-хелперы
    hr/                   — BLE пульс в общей шапке, до 2 слотов (см. docs/TRAINING_HR.md)
  pages/
    admin/                — дашборд, клиенты, статистика, sales, ИСКРА, челленджи
    trainer/              — home, clients, ClientCard, TrainingPage, profile
    sales/                — при необходимости; SalesPnk / AdminSales под /sales
  components/pnk/         — UI воронки ПНК
api/
  *.js                    — тонкие handlers (лимит Hobby ≤12 functions)
  _lib/                   — ядро: pushRecordCore, *Agg, adminData/*, iskra*, …
supabase/
  schema.sql, migrations/, functions/ (create-trainer, delete-trainer, …)
docs/                     — карта в README.md
.cursor/rules/            — architecture, sync, domain, ship, features, …
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
- клубные SMS «Мои Звонки»: `MOIZVONKI_*` env; журнал Postgres `club_sms_log` (см. `docs/MOIZVONKI_SETUP.md`)

См. `.env.example`. Без URL/ключа Supabase — локальный демо-режим.

---

## 5. Аутентификация и роли

- **`AuthContext`**: `role` ∈ `'admin' | 'trainer' | 'sales_manager'`; флаги `isAdmin`, `isTrainer`, `isSalesManager`.
- Без Supabase: fallback в `localStorage`, демо-данные.
- С Supabase: `signInWithPassword` (+ при необходимости `/api/auth-sign-in`), профиль из `users`.

**Маршруты** (`App.jsx`):

| Роль | Пути |
|------|------|
| trainer | `/trainer`, `/trainer/clients`, `/trainer/clients/:id`, `/trainer/workouts/:id`, `/trainer/profile`, челленджи |
| sales_manager | `/sales`, `/sales/club-tasks`, `/sales/pnk` |
| admin | `/admin/*` (clients, statistics, sales, pnk, challenges, club-tasks, structure?tab=… в т.ч. diagnostics / iskra-settings, …), `/admin/workouts/:id` |

**Менеджер и типы АЗ:** справочник `membership_types` (ПЗ + АЗ) нужен для колонок «Тренировки в аэробном зале». Доступ: RLS `fit_membership_types_sales_manager_read` + `admin-data?action=membership-types`. Sync менеджера тянет типы; на отчёте — ещё «Обновить». Подробнее: [SALES_MANAGER.md](./SALES_MANAGER.md), [SYNC.md](./SYNC.md).

Карточка клиента (`ClientCard`) общая для тренера и админа.

**Главная админа / менеджера продаж:** ряд «внимание» — `AdminHomeAttentionRow` (план + ПНК + планёрка + мягкие сигналы в пустые слоты). Сводка дня — spotlight + «Ещё». Тот же каркас при будущих ролях управляющего/куратора ([CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md), [ISKRA_CURATOR.md](./ISKRA_CURATOR.md)).

**В планах (не роли в коде):** управляющий клуба — [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md).

---

## 6. Модель данных и sync (кратко)

Полнее: [DATA_MODEL.md](./DATA_MODEL.md), [SYNC.md](./SYNC.md).

**IDB stores:** `meta`, `clients`, `memberships`, `trainings`, `exercises`, `body_measurements`, `health_cards` (**keyPath: `client_id`**), `clubs`, `sync_queue`, `challenges`, `membership_types`, `nutrition_products`, `homework_presets`, `client_weight_entries`, `outreach_log`, `club_iskra_settings`.

**Поток записи:** UI → `saveLocalWithSync` → IDB + `sync_queue` → при online `/api/push-record` или `push-records` → ручной Sync: **сначала flush очереди**, потом **pull**. Pull не затирает строки с pending (`putStoreUnlessPendingSync`).

**Allowlist push:** `PUSH_ALLOWED_TABLES` в `api/_lib/pushRecordCore.js`.

Продажи / ПНК / ИСКРА на сервере часто идут через **`admin-data?action=`**, не только через очередь планшета.

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

---

## 9. Карточка клиента

Вкладки: **Здоровье**, **Питание**, **ДЗ**, **Абонементы**, **Тренировки**, **Статистика**; для открытого ПНК — мастер шагов и ограничения видимости вкладок (`pnkStagesCore`).

Цель — в `health_cards.goal`.

---

## 10. API и Edge

Каталог endpoints: [API.md](./API.md).

- Vercel: `admin-data`, `trainer-pull`, `push-record(s)`, auth, list-*, create-trainer, …
- Hobby **≤12** `api/*.js` — новое действие → `admin-data?action=`, не новый файл.
- Edge Functions: `create-trainer`, `delete-trainer` (см. DEPLOY).

---

## 11. Сборка, качество, деплой

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Разработка |
| `npm run build` / `preview` | Production-сборка |
| `npm run lint` | ESLint — **всегда** перед «готово» |
| `npm run qa:local` | build + verify + lint (без prod smoke) |
| `npm run qa` | + prod smoke |
| `npm run qa:deep` / `qa:roles` | углублённые / ролевые проверки |
| `npm run check:volume` | объём данных (см. DATA_VOLUME) |
| `npm run db:migrate*` | policies, sales, pnk, iskra, … |

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

---

## 16. Клубы: приложение ≠ Supabase

Симптомы и фиксы: [RUNBOOK.md §3](./RUNBOOK.md), [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).
