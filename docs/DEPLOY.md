# Первый выклад в интернет (фронт + Supabase)

Проект — **одностраничное приложение (React + Vite)** с **PWA**, бэкендом **Supabase** (Postgres + Auth) и **serverless API** в папке `api/` (на проде — **Vercel**). В браузере данные дублируются в **IndexedDB**; без Supabase приложение уходит в «локальный» режим с ограничениями.

**Хостинг сейчас:** Vercel + Supabase. Целевой переезд на РФ — [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md); cutover только по явной команде.

## 1. Что подготовить заранее

- Аккаунт [Supabase](https://supabase.com) (бесплатный тариф подойдёт для старта).
- Хостинг: для **полного** продукта (создание тренера, `admin-data`, push/pull) нужен хост с **Node serverless** из `api/` — на проде это **Vercel**. Чистая статика (`dist` на Netlify / Cloudflare Pages) подойдёт только для демо UI без этих API.
- **Node.js** 18+ (рекомендуется 20 LTS) и `npm`.

## 2. Переменные окружения (обязательно для «облака»)

Скопируйте `.env.example` → `.env` (локально) или задайте те же переменные **в панели хостинга перед сборкой** (они вшиваются в билд на этапе `vite build`).

| Переменная | Описание |
|------------|----------|
| `VITE_SUPABASE_URL` | URL проекта: **Settings → API → Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Ключ **anon public**: **Settings → API → anon public** |

Пустые строки и плейсхолдеры `YOUR_*` считаются «Supabase не настроен» — приложение перейдёт в локальный режим.

**Не публикуйте** в открытый репозиторий файл `.env` (он в `.gitignore`).

## 3. База данных Supabase

### Вариант A: новый проект «с нуля» через SQL

1. В Supabase: **SQL Editor**.
2. Выполните содержимое файла **`supabase/schema.sql`** (создаёт таблицы в актуальном виде под приложение).
3. Затем по очереди выполните миграции из **`supabase/migrations/`** (они идемпотентны: лишние `ADD COLUMN` просто пропустятся, если колонка уже есть в `schema.sql`).

### Вариант B: только миграции (если настроили Supabase CLI)

```bash
supabase link --project-ref <ваш_ref>
supabase db push
```

(Нужен CLI и связь с проектом; для первого раза чаще проще вариант A.)

### RLS и безопасность

Готовые политики для ключевых таблиц: **`supabase/policies.sql`** (clients, trainings, memberships, health_cards, body_measurements). Применение: **`npm run db:migrate`** после `supabase link`, либо выполните файл в **SQL Editor**.

Черновик и комментарии: **`supabase/policies_admin_example.sql`**. Таблицы `users`, `clubs`, `exercises`, `challenges` в `policies.sql` не покрываются — допишите политики под вашу модель **до** продакшена.

## 4. Auth: URL сайта в продакшене

В Supabase: **Authentication → URL configuration**.

- **Site URL** — ваш боевой адрес, например `https://ваш-сайт.netlify.app`.
- **Redirect URLs** — добавьте тот же URL и при необходимости `http://localhost:5173` для локальной разработки.

Иначе вход по почте/паролю с прод-сайта может редиректить не туда.

## 5. API создания / удаления тренера (Vercel `api/`)

В UI админки вызываются **не** Edge Functions, а serverless на том же домене:

| Действие | Endpoint |
|----------|----------|
| Создать тренера | `POST /api/create-trainer` |
| Удалить тренера (без клиентов) | `POST /api/admin-data?action=delete-trainer` |

Нужны **server env** на Vercel (без префикса `VITE_`): как минимум `SUPABASE_SERVICE_ROLE_KEY` (и при необходимости `SUPABASE_URL` / `SUPABASE_ANON_KEY`). Каталог: [API.md](./API.md).

Папки `supabase/functions/create-trainer` и `delete-trainer` — **legacy**; для прода деплоить Edge не нужно (браузер ходит в `/api/*`).

Локально API удобно гонять через `npm run dev:vercel` (или preview после деплоя на Vercel).

## 6. Сборка и проверка локально

```bash
npm ci
cp .env.example .env
# отредактируйте .env — реальные VITE_SUPABASE_*

npm run build
npm run preview
```

Откройте в браузере адрес из вывода `preview`, проверьте вход и основные экраны.

## 7. Выкладка на хостинг

### Vercel (рекомендуется для прода)

Файл **`vercel.json`** — fallback на `index.html` для маршрутов React Router. Папка **`api/`** деплоится как serverless functions (лимит Hobby ≤12 файлов в корне `api/*.js`).

В настройках проекта: **Framework Preset** Vite или **Build** `npm run build`, **Output** `dist`.

Переменные:

- клиент: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ опционально VAPID public);
- сервер: `SUPABASE_SERVICE_ROLE_KEY`, при необходимости Gemini / VAPID private — см. `.env.example`.

Production-эталон: https://fitness-diary-bice.vercel.app

### Netlify / Cloudflare Pages (только статика)

Есть `netlify.toml` и `public/_redirects` для SPA, но **без** serverless `api/` не заработают создание тренера, `admin-data`, push/pull. Для полного клуба — Vercel (или portable host — [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md)).

## 8. После выклада

- Откройте сайт по **HTTPS** (PWA и куки Auth так надёжнее).
- Проверьте вход админа/тренера, список клиентов, одну тренировку.
- При смене домена снова обновите **Site URL / Redirect URLs** в Supabase.

## 9. Если что-то не работает

| Симптом | Что проверить |
|---------|----------------|
| Всегда «локальный режим», нет облака | Переменные `VITE_*` на хостинге и **пересборка** после их добавления |
| Ошибки 401 / пустые таблицы | RLS и политики в Supabase |
| Не вызываются действия с тренерами | Есть ли деплой `api/` на Vercel и server env `SUPABASE_SERVICE_ROLE_KEY`; ответ `/api/create-trainer` не 404 |
| Белый экран на прямом URL `/admin/...` | SPA-редирект на `index.html` (см. конфиги выше) |

Подробности по схеме БД: **`supabase/schema.sql`** и папка **`supabase/migrations/`**.
