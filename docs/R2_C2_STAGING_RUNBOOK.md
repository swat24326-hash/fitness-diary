# R2 / C2 — стенд на Yandex (приложение уже подготовлено)

**Актуально:** 2026-09-28 (волна 2 стартовала: своя база на тесте).  
**Статус:** волна 1 ✅. Идёт **True C2** — Managed PostgreSQL только на стенде. Прод клуба и планшеты **не** переключаем.

Связано: [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md) §5.4 R2, [AUTH_C2_MAP.md](./AUTH_C2_MAP.md), [SYNC.md](./SYNC.md), [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md).

---

## Два уровня дня R2 (важно)

| Уровень | Что поднимаем | Данные / Auth | Когда |
|---------|---------------|---------------|--------|
| **A. Hybrid (день 1)** | Node API + статика на Yandex (`npm start` / Docker) | Пока **те же** `SUPABASE_*` (PostgREST + Auth) | Сразу после команды — проверить хост и Sync на новом origin |
| **B. True C2** | + Managed PostgreSQL + `db:migrate:pg` | Свой Postgres; свой JWT за `authPort` | Следом в том же окне R2; **не** в ночь cutover клуба |

Прод клуба остаётся на **Vercel + Supabase**, пока не скажете стартовать R2 / потом R3.

**Пока нет:** отдельный слой `pg` вместо supabase-js в runtime API. Hybrid A работает без него. True C2 для **записи/чтения зала** через Managed PG — отдельный шаг после живой схемы (см. STRATEGY).

---

## План проверки готовности (четыре волны)

Цель: не перепутать «код готов» с «клуб уже на РФ». Рабочий зал остаётся на Vercel/Supabase, пока волна 3 не зелёная.

| Волна | Что проверяем | Кто | Готово, когда |
|-------|---------------|-----|----------------|
| **0. Репо (сейчас)** | Портативность, хост, план миграций — без облака | агент | три verify зелёные; dry-run `db:migrate:pg` печатает план |
| **1. Hybrid A** | Сайт и API на Yandex, данные пока Supabase | владелец + агент | ✅ 2026-09-26: admin, тренер, Закончить + Sync |
| **2. True C2** | Свой Postgres + свой вход | агент после живой БД | те же сценарии, но запись уже в Yandex PG |
| **3. R3 пилот** | Один живой клуб | владелец даёт дату | 3–7 дней Sync/статистика без отката |

### Волна 0 — без кабинета Yandex (уже прогнано 2026-09-25)

```bash
node scripts/verify-r1-portability.mjs
node scripts/verify-portable-host.mjs
node scripts/verify-pg-migrate-order.mjs
npm run db:migrate:pg -- --dry-run
```

Ожидание: нет prod-URL в `src/`/`api/`; `/api/health` отвечает; план **95 шагов** (stub + schema + auth helpers + 92 миграции). Повторить в день команды R2 — если после этой даты добавились миграции, число шагов вырастет само.

Дополнительно перед стендом (не блокер Hybrid): `npm run lint` и `npm run qa:critical` на текущем коде.

### Волна 1 — Hybrid A (после «стартуем R2…», прод не трогаем)

**Владелец (кабинет, нельзя делегировать):**

1. Войти в [console.yandex.cloud](https://console.yandex.cloud) под ИП. Каталог `default` уже есть.
2. Проверить биллинг: платная версия включена; грант 4000 ₽ до ~**05.10.2026** — после этой даты кластер идёт с карты.
3. Не создавать кучу ВМ «на всякий случай». Одну площадку под приложение согласуем в чате.
4. Пароли стенда — в свой сейф, не в чат.

**Агент / разработка:**

1. Env из `.env.example` (блок C2): те же `SUPABASE_*` / `VITE_*`, плюс `PORT`, `HOST`, `PUBLIC_ORIGIN`.
2. `npm ci && npm run build && npm start` **или** Docker (см. ниже). `VITE_*` вшиваются на **сборке**.
3. `GET /api/health` → `{ ok: true }`. `/api/auth-sign-in` отвечает **JSON**, не HTML.
4. Вход на тестовом адресе: admin, trainer, sales_manager, supervisor (и club, если проверяем управляющего).
5. Планшет / браузер: офлайн → новая тренировка → **Закончить** → абон списался → online → **Sync** → видно в админке **стенда**.
6. Смена даты завершённой → сохранить → Sync → дата не откатилась.
7. `QA_ORIGIN=https://ваш-staging npm run qa:critical` и по возможности `npm run qa:roles`.
8. Записать baseline: время Sync, размер `trainer-pull`, ошибки сети (сравним с продом и с волной 2).

Критерий выхода волны 1: те же критические сценарии, что в [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) §3, на staging. Клуб на проде **не** переключаем.

**Закрыто 2026-09-26 (владелец):** health `cloudKey=ok`; вход admin и тренера; список клиентов; новая тренировка → Закончить → Sync без ошибок. Не отдельно прогоняли: менеджер/управляющий, смена даты завершённой, `QA_ORIGIN` на IP, замер pull. Это не держит волну 1 — можно в волне 2. Прод не трогали.

### Волна 2 — True C2 (то же окно R2, не ночь cutover)

Блокеры в коде (волна 1 это не держит):

- runtime data-port **в репо** (`api/_lib/pgRest/`, флаг `DATA_BACKEND=pg`), на стенде **выключен**;
- свой JWT **в репо** (`AUTH_PROVIDER=own`), на стенде **выключен** — текущая сборка после входа всё ещё спрашивает Supabase;
- клиентский сеанс всё ещё держится на `supabase.auth.*` (`AuthContext`), пока адрес Auth не смотрит на наш `/auth/v1`.

**Замер 2026-09-28:** API — 334 вызова `.from()` в 54 файлах (без вложенных связей в `select`; фильтры `eq/in/gte/lte/lt/is/ilike/not/or`, `order/limit/range`, `single/maybeSingle`, `count: 'exact'`, `upsert onConflict`), `auth.*` — 7. Фронт — 63 прямых `.from()` в 10 файлах (`src/lib/admin/*`, `AuthContext`, `pullReferenceData`), `supabase.auth.*` — 17. Realtime/Storage не используются.

**План волны 2 (предложение агента, ждёт «да» владельца):** не переписывать 400 вызовов, а поднять в `server/` + `api/_lib/` **совместимый слой** — тот же контракт, что у supabase-js, поверх `pg`:

1. **Data-port API** — ✅ код 2026-09-28: `api/_lib/pgRest/` (построитель SQL, `scripts/verify-pg-rest.mjs`) + исполнитель `pg`. `createServiceDataClient()` в `adminSupabase.js` (и вход / создание тренера / вебхук звонков) отдаёт его при `DATA_BACKEND=pg`. Вызовы `.from()` в обработчиках не переписывались. Пока свой Auth не включён, `.auth.admin` на этом клиенте ещё ходит в Supabase. **Флаг на стенде не ставить**, пока нет шага 2 и тестовых пользователей: схема пустая, роли пропадут.
2. **Свой Auth** — ✅ код 2026-09-28: `AUTH_PROVIDER=own` переключает порт на хеш пароля (scrypt, встроен в Node) и JWT (`JWT_SECRET`, от 32 символов). Создание тренера, менеджера и управляющего пишет хеш в `users.password_hash`. Портативный хост отвечает на `/auth/v1/token`, `/user`, `/logout`, чтобы клиент supabase принял сессию, когда адрес Auth — этот сервер. **На стенде флаг не ставить:** сборка всё ещё ходит в Supabase и за проверкой токена, и за частью данных. Включать вместе с `DATA_BACKEND=pg`, тестовыми пользователями и адресом Auth на наш хост.
3. **Фронт** — ✅ код 2026-09-28: портативный хост отвечает на `/rest/v1/<таблица>` в формате supabase-js (`api/_lib/restV1Handler.js`, разбор `api/_lib/pgRest/restV1Parse.js`). Каждый запрос браузера идёт в отдельной транзакции под ролью `authenticated`, в неё кладутся `request.jwt.claims` / `request.jwt.claim.sub` из нашего токена (`rlsTx.js`), поэтому `auth.uid()` и политики RLS видят пользователя. Без нашего access-токена — 401. Маршрут открыт только при `AUTH_PROVIDER=own` **и** `DATA_BACKEND=pg`, иначе 404. Колонка `users.password_hash` для браузера закрыта полностью: её нельзя прочитать, отфильтровать или записать. Вложенные связи в `select` не поддержаны: фронт их и не использует.
   - **Права в базе:** с `--with-policies` файл `policies.sql` идёт **после** миграций. Это актуальный снимок: он использует `fit_auth_*` из миграций (менеджер продаж), а его функции и общие с миграциями политики совпадают с последними версиями (сверено 2026-09-28). Следом всегда переприменяется `supabase/c2_rest_grants.sql`. Таблицы с RLS роль `authenticated` может читать и писать, дальше решают политики. Таблицы без RLS — только читать: иначе, например, тренер поменял бы себе `users.role`.
   - **Консоль (GrokBot):** пользователю `osapp` нужна роль `authenticated` (право `SET ROLE`), иначе каждый запрос браузера упадёт с «permission denied to set role».
   - **Сборка C2:** `VITE_SUPABASE_URL` = адрес стенда (тогда `/auth/v1` и `/rest/v1` идут к нам). `VITE_SUPABASE_ANON_KEY` — любой ключ вида `eyJ…`: наш сервер его не проверяет, доступ решают наш токен и RLS.
   - **RLS на `users` — ✅ 2026-09-29** (`supabase/migrations/20260929120000_users_rls.sql`, проверка `scripts/verify-users-rls.mjs`). Каждый видит себя (по id или по почте из токена); админ видит всех и правит; менеджер продаж и управляющий видят сотрудников своего клуба, без записи; тренер и аноним чужих не видят. Пробник на стенде под 5 логинами подтвердил: тренер не может сменить себе роль (0 строк), клиенты у тренера видны как раньше.
4. **Тестовые данные + прогон** — seed клуба/админа/тренера/клиентов (не прод-ПДн), затем пункты 3–8 волны 1 против PG. Скрипты в репо (2026-09-28), на ВМ всё через `scripts/r2-vm-db-run.sh` (адрес базы из `.env`, не печатается):
   1. Консоль: `osapp` получает роль `authenticated`.
   2. Код шагов 1–4 на ВМ (ветка из GitHub).
   3. `sudo bash scripts/r2-pg-migrate-vm.sh --with-policies`: на уже мигрированной базе догоняет политики и права.
   4. `sudo bash scripts/r2-vm-db-run.sh scripts/c2-seed-staging.mjs`: клуб, `c2-admin` / `c2-trainer` / `c2-sales` / `c2-supervisor`, 3 клиента с абонементами. Пароли лежат в `/opt/fitness-diary/.c2-seed-credentials` (0600), в консоль не выводятся. Справочник упражнений (без него тренировку не закончить): `sudo bash scripts/r2-vm-db-run.sh scripts/c2-seed-exercises.mjs`, повтор безопасен. Свой логин на стенд: `sudo bash scripts/r2-vm-db-run.sh scripts/c2-add-staff.mjs <login> <role> [имя]`, пароль дописывается в тот же файл.
   5. `.env`: `JWT_SECRET` (генерируется на ВМ, не печатается), `AUTH_PROVIDER=own`, `DATA_BACKEND=pg`. Сборка с `VITE_SUPABASE_URL=<адрес стенда>`, перезапуск `os-hybrid`.
   **Статус 2026-09-28: C2 на стенде включён.** Код — ветка `r2-c2`; роль выдана; база с политиками и тестовым клубом; флаги стоят; сборка смотрит на `http://158.160.190.61:8080`.
   - Пробник на ВМ (тот же supabase-js, что в сайте) прошёл все проверки:
     - вход всех четырёх ролей;
     - тренер видит своих 3 клиентов и 3 абонемента; `password_hash` и смена роли дают 403;
     - запись тренировки через `/api/push-record` появляется в выгрузке;
     - менеджер продаж видит 0 клиентов и тренировок;
     - админ видит 3 клиента, тренировку и клуб.
   - Управляющий через `/rest/v1` клиентов не видит, как и на проде: политик на `clients` у него нет, данные он берёт через API.
   - **Откат на Hybrid:** `sudo cp -p /opt/fitness-diary/.env.bak-hybrid /opt/fitness-diary/.env`, затем `sudo -u osapp npm run build` и `sudo systemctl restart os-hybrid`.
   6. Проверки 3–8 волны 1 и `npm run qa:local` перед включением.

Это C2 (наш код на Node), не C1: Supabase-сервисы не разворачиваем.

Когда кластер **Alive** и схема накатана (`DATABASE_URL=… npm run db:migrate:pg`):

1. Реализовать data-port + минимальный Auth по [AUTH_C2_MAP.md](./AUTH_C2_MAP.md).
2. Повторить пункты 3–8 волны 1 **против Yandex PG** (не против Supabase).
3. Сверить counts: клиенты / тренировки / абонементы на стенде (тестовые данные, не прод).
4. ИСКРА / Gemini: один простой вопрос — если из РФ ключ не отвечает, зал не блокируем, помечаем деградацию.
5. Push: на новом origin разрешение уведомлений спросят заново (ожидаемо).

Критерий выхода волны 2: зал пишет и читает уже в Managed PG; вход без Supabase Auth.

**Волна 2 принята 2026-09-29.** Владелец на стенде: вход своим логином (админ) и тренером, тренировки завершаются, статистика читается из Managed PG. RLS на `users` закрыт. `npm run qa:local` зелёный, кроме размера основного бандла (3506 КБ при лимите 3500); на `main` он тот же (≈3505 КБ), то есть не от переезда. `r2-c2` слита в `main` и выкачена на Vercel 2026-09-29 ночью: на проде флаги C2 не заданы, клуб работает на Supabase как раньше, миграция RLS на `users` в базу прода **не** накатана. Волна 3 (R3) — отдельной командой.

### Волна 3 — пилот клуба (R3, отдельная команда)

**До команды «стартуем R3…»:** биллинг, дожим жалоб зала, **свой домен** и чеклист ночи — [PRE_R3_OWNER.md](./PRE_R3_OWNER.md), DNS/HTTPS — [R3_DOMAIN.md](./R3_DOMAIN.md).

Только после зелёных волн 1–2. Чеклист STRATEGY §5.4 R3:

1. Бэкап prod Supabase.
2. На планшетах **сначала** Sync до пустой очереди (иначе pending уедут «не туда»).
3. Dump / перенос → РФ; сверка counts: `scripts/r3-copy-data.mjs` (REST облака → Managed PG одной транзакцией; репетиция 30.09 ок). Ночь по шагам — [R3_NIGHT.md](./R3_NIGHT.md).
   - **Пароли сотрудников** (готово в коде 2026-09-29): в SQL Editor Supabase `select id, email, encrypted_password from auth.users` → скачать CSV → на ВМ в файл 0600 → `sudo bash scripts/r2-vm-db-run.sh scripts/r3-import-auth-hashes.mjs <файл>` (план) и тот же вызов с `--apply` (запись). Сопоставление по id, затем по почте; пароль, уже заданный на новом сервере, не перезаписывается; кому пароль не нашёлся — скрипт выводит логины. Файл выгрузки удалить. Сотрудники входят со старыми паролями: вход понимает bcrypt Supabase и при первом входе пересохраняет пароль в scrypt (проверено на стенде).
   - **Тренеры на своём входе** (проверено на стенде 2026-09-29, 19 шагов): создание, отказ на занятый логин (текст по-русски), тренер не может создать тренера, сброс пароля, блок / разблок, удаление. Заблокированный или удалённый сотрудник теряет доступ при ближайшем продлении сессии (не позже часа), не через 30 дней.
4. **Свой домен `app-core.ru`** (2026-09-30): DNS A → ВМ, Let's Encrypt, `PUBLIC_ORIGIN=https://app-core.ru` — [R3_DOMAIN.md](./R3_DOMAIN.md). Не оставлять зал на IP стенда. Новый origin = **новый ярлык PWA**.
   - **Группа безопасности ВМ (до или в ночь R3):** входящие TCP **80** и **443** из интернета (для Let's Encrypt и HTTPS). Порты **22** и **8080** не закрывать. Задача GrokBot `2026-09-30-01` (change); если вебхук без браузера — владелец пишет GrokBot в чат «сделай 2026-09-30-01» или открывает правила сам в консоли.
5. 3–7 дней усиленного Sync и статистики. Окно отката: DNS назад + старый Supabase read-only.

Не смешивать с волной 3: оплаты/касса, security-спринт §5.7, смена модели Sync.

---

## Что уже в репо (prep, прод не трогает)

| Кусок | Где |
|-------|-----|
| Portable API + статика | `server/` → `npm run build && npm start` |
| Health | `GET /health` и `GET /api/health` |
| Docker | `Dockerfile` (+ build-args `VITE_*`) |
| Миграции bare PG | `npm run db:migrate:pg` + stub `supabase/c2_auth_stub.sql` + `supabase/c2_auth_helpers.sql` (базовые `fit_auth_*`, на Supabase пришли из `policies.sql`); на ВМ — `scripts/r2-pg-migrate-vm.sh` |
| Порт Auth | `api/_lib/authPort.js` — Supabase, либо `AUTH_PROVIDER=own` (`authOwnCore.js`, `authPortOwn.js`) |
| Совместимый `/auth/v1` | `api/_lib/authV1Handler.js` на портативном хосте (token, user, logout). Пока флаг не own — 404 |
| Env-заготовки | `.env.example` (блок C2) |
| Data-port API | `api/_lib/pgRest/` + `DATA_BACKEND=pg` (на стенде флаг выключен) |
| Совместимый `/rest/v1` | `api/_lib/restV1Handler.js` + `pgRest/restV1Parse.js`, `restV1Shape.js`, `rlsTx.js`; права — `supabase/c2_rest_grants.sql`. Открыт только при own + pg |
| Verify | `verify-pg-migrate-order.mjs`, `verify-pg-rest.mjs`, `verify-auth-own.mjs`, `verify-pg-rest-v1.mjs`, `verify-portable-host.mjs` |

---

## День 1 Hybrid — что нажать в консоли (сейчас)

Нужна **одна небольшая виртуальная машина** (сервер приложения). Кластер Postgres **не** создаём: Hybrid пишет в текущее облако; пустая база только жрёт грант.

Каталог: **`default`** в облаке `cloud-semenov172609`.

1. Откройте [console.yandex.cloud](https://console.yandex.cloud) под ИП.
2. **Compute Cloud** → **Виртуальные машины** → **Создать**.
3. Имя: `os-hybrid-staging`.
4. Образ: **Ubuntu 24.04**.
5. Платформа: 2 vCPU, **4 ГБ** RAM (сборка `npm run build` на 2 ГБ часто падает).
6. Диск: 20 ГБ, network-SSD.
7. Сеть: default; **публичный адрес** — автоматически.
8. Группа безопасности: TCP **22** (вход) и **8080** (сайт стенда). Не открывайте базу в интернет.
9. SSH-ключ: создайте в консоли или вставьте свой. Пароль от ключа — в сейф, не в чат.
10. Создать → дождаться **RUNNING** → скопировать **публичный IPv4**.

**Сделано 2026-09-25:** ВМ `os-hybrid-staging` Running, IP `158.160.190.61`, порты 22 и 8080 открыты.

**Закрыто 2026-09-26:** волна 1 принята (admin, тренер, Закончить + Sync).

## День 1 волны 2 — кластер Postgres (только тест)

Сотрудников и прод **не трогаем**. Кластер в той же сети, что ВМ. Базу **не** открывать в интернет.

1. [console.yandex.cloud](https://console.yandex.cloud) → каталог `default`.
2. **Managed Service for PostgreSQL** → **Создать кластер**.
3. Имя: `os-c2-staging`.
4. Версия PostgreSQL: **16** (если нет в списке — 15).
5. Класс хоста: самый маленький (часто **s2.micro** / аналог 2 vCPU, 8 ГБ — если микро недоступен, не брать высокую доступность).
6. Хостов: **1** (без запасного — экономия гранта).
7. Диск: **20 ГБ** network-SSD.
8. Сеть: **default**, та же что у `os-hybrid-staging`.
9. Публичный доступ к БД: **выкл**. Доступ только из ВМ.
10. Пользователь БД: например `osapp`. Пароль — в сейф, **не в чат**.
11. База: `fitness_diary`.
12. Создать → дождаться статуса **Alive**.

В чат напишите только: **«кластер Alive»**. Строку подключения и пароль не присылайте.

**Кластер Alive 2026-09-28:** `os-c2-staging`, порт 6432, база `fitness_diary`, пользователь `osapp`, публичный доступ выкл.

**Схема накатана 2026-09-28:** `db:migrate:pg done` с ВМ; 38 таблиц в `public`, 94 записи в `_schema_migrations` (пустая миграция не пишется), повторный прогон — `nothing to apply`/`done`. RLS (`policies.sql`) не применяли. Сайт стенда по-прежнему пишет в Supabase. Data-port в коде есть, флаг не включён — дальше свой Auth и тестовые пользователи.

### Схема на кластер (с ВМ)

1. **Роли-заглушки.** Владелец БД в Managed PG не может `CREATE ROLE`. В консоли кластера → Пользователи создать `authenticated`, `anon`, `service_role` (любой длинный пароль, **без** доступа к базам). Иначе stub остановится с понятной ошибкой.
1a. **Расширение `pgcrypto`.** В консоли кластера → база `fitness_diary` → Расширения → добавить `pgcrypto`. Из SQL владелец БД его не создаст (`permission denied to create extension`).
2. **Сертификат** Яндекса уже на ВМ: `/etc/ssl/yandex/CA.pem` (публичный, не секрет).
3. **`DATABASE_URL`** в `/opt/fitness-diary/.env` через защищённую форму, не в чат:
   `postgres://osapp:<пароль>@<хост>:6432/fitness_diary?sslmode=verify-full&sslrootcert=/etc/ssl/yandex/CA.pem`
   Проще всего с ПК владельца: `powershell -ExecutionPolicy Bypass -File scripts\r2-set-database-url.ps1` — пароль вводится скрыто, кодируется и уходит на ВМ по SSH. Вручную — спецсимволы пароля URL-кодировать. `sslmode=require` не подходит: `pg` всё равно сверяет сертификат, без CA будет `self-signed certificate in certificate chain`.
4. На ВМ: `sudo bash /opt/fitness-diary/scripts/r2-pg-migrate-vm.sh --dry-run`, затем без флага. Пароль скрипт не печатает.

Работающий сайт `DATABASE_URL` не читает, пока в `.env` нет `DATA_BACKEND=pg`. Data-port уже в коде; включать флаг на стенде — только вместе со своим Auth и тестовыми пользователями, не на живом Hybrid.

**Smoke 25–26.09:** ключ `cloudKey=ok`; admin и список тренера ок. Тренировка на `http://IP` открывается (`safeRandomUuid`). Владелец 26.09 ~19:28: начал → Закончил → Sync, ошибок нет. Прод и True C2 не трогаем.

На машине (после IP) ставится Node 22 и приложение: `scripts/r2-hybrid-vm-setup.sh`. Секреты (`VITE_*`, `SUPABASE_*`) владелец кладёт в `.env` на сервере сам, из панели Vercel / сейфа. `SUPABASE_SERVICE_ROLE_KEY` — длинная строка с `eyJ…`, не заглушка. Проверка без секрета: строка `[portable-api] cloudKey: ok` в `journalctl -u <сервис>` после старта (с 06.10 не в публичном `/api/health`). Ключ в чат не присылать.

---

## День R2 (после вашей команды)

### 1. Env

Скопируйте `.env.example` → секреты стенда.

**Hybrid A (минимум):**

- `SUPABASE_*` / `VITE_*` — как на проде (или отдельный staging-проект Supabase)
- `PORT` / `HOST` / `PUBLIC_ORIGIN`
- `GEMINI_*`, `VAPID_*` по необходимости

**True C2 (+ к Hybrid):**

- `DATABASE_URL` — Yandex Managed PostgreSQL (`sslmode=verify-full` и `sslrootcert` на стенде)
- `DATA_BACKEND=pg` — API пишет в эту базу через `api/_lib/pgRest/`. Без флага (или `supabase`) — как раньше, PostgREST. На Hybrid-стенде не включать раньше своего Auth.
- `JWT_SECRET` — секрет подписи нашего JWT, когда `AUTH_PROVIDER=own` (не короче 32 символов). На Hybrid не включать раньше тестовых пользователей.
- `AUTH_PROVIDER=own` — вход и проверка Bearer наши. Без флага (или `supabase`) — как раньше, Supabase Auth. См. [AUTH_C2_MAP.md](./AUTH_C2_MAP.md).

### 2. Схема БД (только True C2 / репетиция PG)

```bash
DATABASE_URL=postgres://… npm run db:migrate:pg
# план без БД: npm run db:migrate:pg -- --dry-run
# RLS-файл: npm run db:migrate:pg -- --with-policies
```

Порядок: **`c2_auth_stub.sql`** → `schema.sql` → `c2_auth_helpers.sql` → `supabase/migrations/*.sql` → (с `--with-policies`) `policies.sql` → (с `--with-policies`, каждый прогон) `c2_rest_grants.sql`.

Stub создаёт `auth.users`, `auth.uid()` / `auth.jwt()`, роли `authenticated` / `anon` / `service_role` — иначе миграции с `REFERENCES auth.users` падают на голом Postgres.

По умолчанию **`policies.sql` не применяется**. `--with-policies` нужен для True C2 с браузером на `/rest/v1`: без RLS браузер работать не будет. Можно запускать и на уже мигрированной базе.

Повторный прогон идемпотентен (`_schema_migrations`; stub переприменяется безопасно).

Миграции запускайте **с машины разработчика / CI**, не обязательно из Docker-образа приложения.

### 3. Запуск приложения

```bash
npm ci
npm run build
npm start
# проверка: curl -s http://localhost:8080/api/health
```

Docker:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  -t os-c2 .
docker run --env-file .env -p 8080:8080 os-c2
```

`VITE_*` **вшиваются на build** — runtime env их не подставит в уже собранный `dist`.

Проверка: открыть `PUBLIC_ORIGIN`, `/api/health` → JSON `{ ok: true }`, `/api/auth-sign-in` отвечает JSON (не HTML).

### 4. Smoke

1. Вход: admin, trainer, sales_manager, supervisor.  
2. Планшет: тренировка офлайн → Sync → видно в админке стенда.  
3. `QA_ORIGIN=https://ваш-staging npm run qa` и `npm run qa:roles` (по возможности).

### 5. Auth на C2

Шов и реализация в коде (`authPort`, `AUTH_PROVIDER=own`). **На стенде не включено.** Включать в том же окне R2 после тестовых пользователей, вместе с data-port, **не** в ночь cutover клуба. Карта: [AUTH_C2_MAP.md](./AUTH_C2_MAP.md).

---

## Чего не делать в этом runbook

- Менять DNS / URL рабочего клуба (это R3).  
- Security-спринт §5.7 и оплаты/кассу.  
- Ломать модель Sync «под хостинг».  
- Считать «migrate:pg прошёл» = «API уже пишет в Yandex PG» — без `DATA_BACKEND=pg` стенд по-прежнему ходит в Supabase. Флаг не включать на Hybrid раньше своего Auth.

---

## Откат prep

Удалять `server/` / Docker не обязательно: прод их не вызывает. Откат R2-стенда — выключить контейнер / DNS staging, прод не затронут.
