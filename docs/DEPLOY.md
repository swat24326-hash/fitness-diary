# Первый выклад в интернет (фронт + Supabase)

Проект — **одностраничное приложение (React + Vite)** с **PWA** и бэкендом **Supabase** (Postgres + Auth + Edge Functions). В браузере данные дублируются в **IndexedDB**; без Supabase приложение уходит в «локальный» режим с ограничениями.

## 1. Что подготовить заранее

- Аккаунт [Supabase](https://supabase.com) (бесплатный тариф подойдёт для старта).
- Хостинг для **статики** из папки `dist` после `npm run build` (например **Netlify**, **Vercel**, **Cloudflare Pages** — в репозитории уже лежат заготовки конфигов).
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

## 5. Edge Functions (создание / удаление тренера)

В коде вызываются функции:

- `create-trainer`
- `delete-trainer`

Из каталога проекта (при установленном [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase functions deploy create-trainer
supabase functions deploy delete-trainer
```

Проверьте в **Dashboard → Edge Functions**, что функции появились и вызываются без ошибки (логи в той же панели).

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

### Netlify

В репозитории есть **`netlify.toml`**: сборка `npm run build`, публикация **`dist`**, SPA-редирект на `index.html`.

В Netlify: **Site settings → Environment variables** — добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`, затем **Trigger deploy** (пересборка нужна, чтобы переменные попали в клиент).

### Vercel

Файл **`vercel.json`** — fallback на `index.html` для маршрутов React Router.

В настройках проекта: **Framework Preset** можно оставить Vite или указать **Build Command** `npm run build`, **Output** `dist`. Переменные окружения — те же `VITE_*`.

### Cloudflare Pages

В репозитории **`public/_redirects`** (попадает в корень `dist`) — правило SPA `/* → /index.html`.

Build command: `npm run build`, output directory: `dist`, переменные `VITE_*` в настройках Pages.

## 8. После выклада

- Откройте сайт по **HTTPS** (PWA и куки Auth так надёжнее).
- Проверьте вход админа/тренера, список клиентов, одну тренировку.
- При смене домена снова обновите **Site URL / Redirect URLs** в Supabase.

## 9. Если что-то не работает

| Симптом | Что проверить |
|---------|----------------|
| Всегда «локальный режим», нет облака | Переменные `VITE_*` на хостинге и **пересборка** после их добавления |
| Ошибки 401 / пустые таблицы | RLS и политики в Supabase |
| Не вызываются действия с тренерами | Задеплоены ли Edge Functions и не блокирует ли их CORS/ключ |
| Белый экран на прямом URL `/admin/...` | SPA-редирект на `index.html` (см. конфиги выше) |

Подробности по схеме БД: **`supabase/schema.sql`** и папка **`supabase/migrations/`**.
