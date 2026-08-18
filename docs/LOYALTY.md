# Лояльность ПЗ — контракт к разработке

**Актуально:** 2026-08-19  
**Статус:** фазы **A–G** ✅ (правила, штамп, API, вкладка/чип, списание, архив/переезд, тумблер в Структуре).  
**Не:** касса, склад, рубли, ЛК клиента, ТЗ/АЗ, челленджи.

Ситуация: клиент ПЗ копит баллы, на стойке забирает куш. Одна цифра — с сервера.

Даты: `src/lib/dateRu.js`. `as_of` на сервере = `todayInTimeZoneIso(CLUB_OPS_TIMEZONE)` (`Europe/Moscow`). Неделя пн–вс от `YYYY-MM-DD` через `Date.UTC`. Куш: `addMonthsToIso(cycle_start, months)` одним вызовом. Времена `completed_at` / `redeem.at` сравнивать как ISO-строки (лексикографически для `…Z` / офсета — нормализовать через `Date.parse`).

API тянет логику из `src/lib/loyalty/*` (как `membershipRules` из `_lib`). **Не** копировать в `api/_lib/loyalty`.

---

## 0. Одна фраза

Настройки на клуб. Цикл клиента: первая подходящая тренировка → копит → через N месяцев можно списать всё → списал — новый цикл с момента списания. Пропуск законченной недели / архив / переезд клуба — ноль. Пропуск не записываем: если тренировка той недели потом доехала — копилка жива; следующая тренировка **после** дырки открывает новый цикл.

---

## 1. Что больше не развилка

| Тема | Правило |
|------|---------|
| Неявка | `data.is_writeoff === true` **или** `type === 'Списание'` **или** focus «Списание (неявка)». В коде неявки тип часто `Силовая` — одного `type` мало |
| После пропуска при живом redeem | Не оставлять `cycle_start` на дате куша. Цикл мёртв; новый = первая подходящая с датой **после воскресенья дырки** (§4 цикл) |
| Тот же день что куш/архив/переезд | В новый отсчёт только `completed_at` строго позже якоря |
| Выкл программы | Интервалы. Флаг `enabled` **только** запрещает списание. Начисление и пропуск — по интервалам |
| Смена ставок | Снимок на старте цикла. Живые `max_minutes` / 800 — только в момент complete на `loyalty.kcal` |
| Late sync | Сгорание не якорь |
| Будущая дата | `date > as_of` не eligible |
| Keytel | Средний пульс и длительность **по сэмплам окна**, не стена 60 мин |
| Источник правды баланса | Только `buildLoyaltyAccount`. Ledger не хранит «+50 за неделю» |
| Неявка vs каскад клуба | §3 и §4.2 |

Накрутка датой завершённой — как абонемент, замок не делаем.

---

## 2. Чистые функции (фазы A–C)

| Файл | Экспорт |
|------|---------|
| `loyaltyWeekCore.js` | `mondayOf(iso) → YYYY-MM-DD`, `sundayOf`, `isoWeeksInclusive(fromMonday, toMonday)`, `addDaysIso` |
| `loyaltyEnabledCore.js` | `normalizeEnabledIntervals(raw)`, `isDateEnabled(iso, intervals)`, `weekFullyEnabled(monday, intervals)`, `applyProgramToggle(intervals, { enabled, as_of })` |
| `loyaltyTrainingEligibleCore.js` | `isLoyaltyEligibleTraining(t, ctx)`, `isLoyaltyNoShowTraining(t)` |
| `loyaltyKcalCore.js` | `computeLoyaltyKcal({ samples, sessionStartedAt, health, maxMinutes, maxKcal }) → int` |
| `loyaltyAccountCore.js` | `buildLoyaltyAccount`, `trainingInOpenCycle`, `shouldInsertLoyaltyCycleOpen` |
| `loyaltySettingsCore.js` | `normalizeLoyaltySettings(raw) → settings` (chunk≥1, числа ≥0, months 1…24) |
| `loyaltyPersistCore.js` | `applyLoyaltyOnTrainingPersist`, `ensureLoyaltySessionStartedAt`, `resolveLoyaltyCompleteCaps` |
| `loyaltyAccessCore.js` | роли, 403-тексты, glance ids |
| `loyaltyGlanceUiCore.js` | пачки ≤80, кому показывать чип/вкладку, тексты, last-good |
| `loyaltyRedeemUiCore.js` | кнопка списать: роли, офлайн, confirm, 409 |
| `loyaltyJournalUiCore.js` | строки журнала списаний |
| `loyaltyRedeemDecisionCore.js` | `decideLoyaltyRedeem` (400/409) |
| `loyaltySettingsWriteCore.js` | POST настроек + интервалы |

Verify: `scripts/verify-loyalty.mjs`, `verify-loyalty-persist.mjs`, `verify-loyalty-api.mjs`, `verify-loyalty-ui.mjs`, `verify-loyalty-redeem.mjs`, `verify-loyalty-archive.mjs`, `verify-loyalty-settings.mjs`, `verify-loyalty-integration.mjs`. API: `api/_lib/adminData/loyaltyHandlers.js` (импорт `src/lib/loyalty`, без копии алгоритма).

---

## 3. Подходящая тренировка `isLoyaltyEligibleTraining`

Контекст: `{ as_of, client_id, club_id, memberships, types, intervals, club_moved_on, club_moved_at }`.

Ложь, если хоть один пункт не так:

1. `client_id` совпал.
2. `status === 'completed'`.
3. Не неявка: не `data.is_writeoff`, не `type === 'Списание'`, не `training_focus` содержит «Списание (неявка)» (без регистра).
4. `date` валидный `YYYY-MM-DD` и `date <= as_of`.
5. `date` покрыт `intervals`.
6. Если переезд **в этот** клуб задан: `date > club_moved_on` **или** (`date === club_moved_on` и `completed_at > club_moved_at`). Нет `completed_at` в день переезда → не eligible в новом клубе.
7. Абонемент: если `data.membership_id` и строка есть — берём её. Нет в списке — `resolveMembershipForDiaryTraining`. Нет абона → не eligible.
8. `hall` не `tz` и не `az` (пусто = ПЗ).
9. Тип не `isPnkTrialTypeRow`.

Фильтр `training.club_id === club_id` **не** использовать как главный (каскад реассайна врёт). Клуб задаёт контекст расчёта + якорь переезда.

---

## 4. `buildLoyaltyAccount` — единственный алгоритм

**Вход**

```text
{
  as_of,                    // YYYY-MM-DD
  client_id, club_id,
  archived_at,              // ISO | null — живое поле клиента
  settings,                 // normalizeLoyaltySettings
  trainings, memberships, membership_types,
  ledger                    // якоря этого клуба+клиента
}
```

Если `archived_at` не null → сразу **idle** (в архиве куш не живой). Ledger `burn_archive` для истории и для жизни **после** «Вернуть» (тогда `archived_at` снова null, origin = этот burn).

**Якоря ledger:** `redeem | burn_archive | club_move | program_toggle | cycle_open`.  
**Hard** (выбор origin): `redeem`, `burn_archive`, `club_move`.  
Сортировка: `at` по возрастанию; при равном `at`: `burn_archive` = `club_move` > `redeem`. Последний = origin.

Нет hard → origin `{ kind: 'program_start', at: null, date: settings.enabled_at }`. Нет `enabled_at` и пустые intervals → idle.

`settings.enabled === false` **не** обнуляет points; только `can_redeem = false`.

### 4.1. Цикл с рестартом после дырки

```text
openedBy = origin.kind          // redeem | burn_archive | club_move | program_start
cursorDate = origin.date        // календарь MSK от at
cursorAt = origin.at            // ISO или null у program_start
safety = 0

loop:
  safety += 1; if safety > 200: return idle

  eligible = все isLoyaltyEligibleTraining (club_moved_* из последнего club_move в этот клуб)

  if openedBy == 'redeem':
    cycle_start = cursorDate
    in_cycle = eligible где date > cycle_start
               ИЛИ (date == cycle_start И completed_at > cursorAt)
    snapshot = redeem.snapshot этого origin, иначе settings.rates
    // пустой in_cycle всё равно provisional ACTIVE
  else:
    # program_start | burn_archive | club_move | miss_restart
    cutoffDate = cursorDate
    cutoffAt = cursorAt  # у miss_restart и program_start: cutoffAt = null → достаточно date >= cutoffDate
    pool = eligible где
      date > cutoffDate ИЛИ (cutoffAt и date == cutoffDate и completed_at > cutoffAt)
                       ИЛИ (!cutoffAt и date >= cutoffDate)
    если pool пуст → return idle
    first = min(pool по date, затем completed_at, затем id)
    cycle_start = first.date
    in_cycle = eligible где date >= cycle_start и date <= as_of
    snapshot = cycle_open.snapshot где payload.cycle_start == cycle_start, иначе settings.rates

  W = самая ранняя пропущенная неделя (§4.2) для cycle_start + in_cycle
  если W есть:
    openedBy = 'miss_restart'
    cursorDate = день после sunday(W)
    cursorAt = null
    continue
  иначе:
    return ACTIVE из in_cycle + snapshot + cycle_start
```

`settings.rates` = `{ cycle_months, points_per_week, kcal_chunk, points_per_kcal_chunk }`.

Ленивая запись `cycle_open` (не в чистой функции): если вернули ACTIVE не из redeem и нет строки `cycle_open` на этот `cycle_start` — INSERT идемпотентно.

### 4.2. Пропуск недели

Ключ недели = `mondayOf(date)`.

Неделя W пропуск, если все:

1. `monday(W) >= monday(cycle_start)`
2. `sunday(W) < as_of`
3. ни одна `in_cycle` не имеет `monday(date) === monday(W)`
4. `weekFullyEnabled(monday(W), intervals)` — все 7 дней вкл

Самая ранняя такая W. Нет → пропусков нет.

`missed_open_week`: ACTIVE, программа сегодня вкл (`isDateEnabled(as_of)`), в текущей неделе (monday ≤ as_of ≤ sunday) нет `in_cycle`.

### 4.3. Баллы ACTIVE

- `weeks_credited` = число уникальных monday дат `in_cycle`
- `week_points` = weeks_credited × snapshot.points_per_week
- `kcal_sum` = сумма `data.loyalty.kcal` (нет/мусор → 0)
- `kcal_points` = floor(kcal_sum / chunk) × points_per_chunk
- `kcal_remainder` = kcal_sum % chunk
- `points` = week_points + kcal_points
- `unlock_on` = addMonthsToIso(cycle_start, snapshot.cycle_months)
- `can_redeem` = settings.enabled && points > 0 && as_of >= unlock_on

IDLE: points 0, remainder 0, cycle_start/unlock_on null, can_redeem false.

---

## 5. Запись событий (не чистая функция)

| Событие | Когда | Поля |
|---------|--------|------|
| `redeem` | POST списание, points совпали | at=now, points, comment≤200, actor_id, snapshot=**текущие** rates (новый цикл) |
| `burn_archive` | `archived_at` стал не null | at=archived_at |
| `club_move` | сменился `clients.club_id` | at=now, payload `{ from, to, club_moved_on: as_of }` на **новом** клубе. Старый клуб: тот же kind, payload `{ left: true }` для журнала |
| `program_toggle` | POST settings enabled | аудит; правда интервалов — строка settings |
| `cycle_open` | первый GET/redeem ACTIVE не-redeem без строки | payload.cycle_start, snapshot rates |

Restore из архива **не** удаляет `burn_archive`. Смена тренера **без** смены клуба — без ledger.

Redeem 409 если `expected_points !== points`. Повтор после успеха: points 0 → 409. Тренер 403.

---

## 6. Ккал на first complete

Писать только при `isTrainingFirstCompletion`. Дальше не пересчитывать.

```text
data.loyalty = { session_started_at, completed_at, kcal }
```

`session_started_at`: при первом заходе в форму; если id ещё `pending` — как буфер HR, **перенести** на uuid при первом save, не создавать второй штамп.

Нет штампа на complete → kcal 0 (визит жив).

Живые настройки complete: `max_minutes`, `max_kcal_per_training` (уже normalize).

`computeLoyaltyKcal`:

1. Сэмплы с `t` в `[start, start + max_minutes*60s]`. Пусто → 0.
2. Нет веса/пола/ДР → 0.
3. `avgBpm` = среднее bpm окна.
4. Один сэмпл: длительность `HR_SAMPLE_INTERVAL_MS` (5 с), как `aggregateHrSamples`.
5. Несколько: `(t_last - t_first) / 60000` минут, потолок `max_minutes`.
6. `estimateKcalKeytel` → round → min(…, max_kcal).

---

## 7. Настройки

`club_loyalty_settings` PK `club_id`.

| Поле | Дефолт | Нормализация |
|------|--------|----------------|
| enabled | false | boolean |
| enabled_at | null | день первого вкл |
| enabled_intervals | [] | `{ start, end }[]`, end null = открыт |
| cycle_months | 3 | int 1…24 |
| points_per_week | 50 | int ≥0 |
| kcal_chunk | 100 | int ≥1 |
| points_per_kcal_chunk | 5 | int ≥0 |
| max_minutes | 60 | int 1…180 |
| max_kcal_per_training | 800 | int ≥0 |

`applyProgramToggle`: вкл при открытом интервале с `start=as_of` → только `end=null`. Выкл: `end=as_of` (день **включён**, тренировка в этот день ещё копит). Не плодить дырку нулевой длины.

POST только admin. Существующий `resolveClubId` как у остальных admin-data.

---

## 8. Таблицы (миграция)

```text
club_loyalty_settings (
  club_id UUID PK REFERENCES clubs,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at DATE,
  enabled_intervals JSONB NOT NULL DEFAULT '[]',
  cycle_months INT NOT NULL DEFAULT 3,
  points_per_week INT NOT NULL DEFAULT 50,
  kcal_chunk INT NOT NULL DEFAULT 100,
  points_per_kcal_chunk INT NOT NULL DEFAULT 5,
  max_minutes INT NOT NULL DEFAULT 60,
  max_kcal_per_training INT NOT NULL DEFAULT 800,
  updated_at TIMESTAMPTZ DEFAULT now()
)

loyalty_ledger (
  id UUID PK,
  club_id UUID NOT NULL REFERENCES clubs,
  client_id UUID NOT NULL REFERENCES clients ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'redeem','burn_archive','club_move','program_toggle','cycle_open'
  )),
  at TIMESTAMPTZ NOT NULL,
  points INT,
  comment TEXT,
  actor_id UUID REFERENCES users,
  snapshot JSONB,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
)
INDEX (club_id, client_id, at)
UNIQUE (client_id, club_id, (payload->>'cycle_start')) WHERE kind = 'cycle_open'
```

RLS: прямой PostgREST с планшета запрещён (не в push allowlist). API — service role + requireAuth. Trainer не пишет ledger.

IDB `loyalty_glance`: keyPath `client_id`, поля снимка §13 + `saved_at`. Только pull/GET, не sync_queue, не prune как полный дневник.

`trainings.data` — без новой колонки Postgres.

---

## 9. API

`admin-data?action=` → `loyaltyHandlers.js`. Новый `api/*.js` не создавать.

| action | Кто | |
|--------|-----|---|
| loyalty-settings GET | роли своего клуба | |
| loyalty-settings POST | admin | |
| loyalty-account GET | trainer **только свои** client.trainer_id; sales/supervisor/admin клуба | полный снимок + лента |
| loyalty-glance GET | те же; ids ≤ 200 | |
| loyalty-redeem POST | sales_manager, admin | `{ client_id, expected_points, comment }` |
| loyalty-journal GET | sales_manager, admin | |

Glance **не** класть в тело `trainer-pull` (pull уже тяжёлый, 90 дней дневника). Отдельный GET `loyalty-glance` после pull / при открытии списка. Вкладка карточки — только GET `loyalty-account`. **`get-client` не расширять.**

---

## 10. UI (фаза D–G)

| Кто | Что |
|-----|-----|
| Все роли карточки | Вкладка «Баллы» = секция, не логика в `ClientCard.jsx` |
| Список | `LoyaltyGlanceChip` в `TrainerClientListItem` и строке админ/продаж |
| Sales + admin | Кнопка списать на вкладке (disabled без сети / !can_redeem); `/sales/loyalty` и `/admin/loyalty` журнал |
| Admin | Structure `?tab=loyalty` |
| Supervisor | вкладка read-only |
| Архив | в модалке N баллов (GET перед confirm) |
| Реассайн клуб | текст в существующем confirm |

Стили: `src/styles/loyalty.css`. Офлайн: last-good + «списание только в сети».

---

## 11. Контуры — не ломать

Дневник complete и списание абона — рядом, не внутри. Неявка `is_writeoff` уже есть. Реассайн каскадит `club_id` — якорь переезда обязателен. Lite/ТЗ/АЗ/ПНК/БЗ вне (штамп `session_started_at` тоже только у клиента программы). Статистика, CQ, ЗП, челленджи, ИСКРА, касса, Max — не трогать.

Таймауты: GET настроек на «Завершить» **4 с** (иначе дефолт 60/800), параллельно с выбором абонемента; карточка/glance/списание **8 с**; предупреждение архива/переезда — **last-good сразу**, иначе GET **2 с**, не выдумываем 0; снимок баллов при архиве в push **3 с**, затем `burn_archive` с 0. Glance после trainer-pull (`syncHeaderPullTrainer.js`) — фон, **не** держит Sync и **не** ставит ошибку Sync.

---

## 12. Снимок UI

```text
{
  enabled, state: 'idle'|'active',
  points, kcal_remainder, weeks_credited,
  cycle_start, unlock_on, can_redeem, missed_open_week, as_of
}
```

---

## 12a. Чтобы секция **заработала** в приложении

Без этого списка баллы не капают, даже если алгоритм готов. Дефолт `enabled=false` и пустые интервалы → все idle.

### Уже есть в продукте (новое не строим)

Завершение персоналки, `data.membership_id`, неявка `is_writeoff`, абонементы ПЗ/БЗ, карта здоровья, BLE-пульс и `hr_session` на Итоге, архив, реассайн клуба, роли, `admin-data`, `trainer-pull`, общая `ClientCard`, списки клиентов.

### Минимум, чтобы **капала регулярность** (50 за неделю)

Нужны **A + C + G + B (штамп complete, ккал можно 0)** и живое «Завершить» ПЗ.

| # | В приложении | Зачем |
|---|--------------|--------|
| 1 | Фаза A: `src/lib/loyalty/*` + verify | Правила |
| 2 | Фаза C: migration `club_loyalty_settings` + `loyalty_ledger`, RLS, `loyaltyHandlers` в `api/admin-data.js` | Считать на сервере |
| 3 | Фаза G: тумблер клуба **вкл**, первый интервал | Иначе eligible нет |
| 4 | Фаза B: в `TrainingPage` `persist` при first complete — `data.loyalty.session_started_at` / `completed_at` (kcal 0 допустим) | Время сессии; неявка не пишется |
| 5 | Тренер как сейчас завершает ПЗ не-БЗ | Источник визита |

Ккал (5 за 100) дополнительно: в `persist` first complete вызвать `getSessionSamples(clientId)` (контекст пульса), не сводку `hr_session`. Без пояса капает только неделя.

### Чтобы **было видно и списать** (секция живая в UI)

| Куда в приложении | Файл / место | Что дописать |
|-------------------|--------------|----------------|
| Карточка клиента | `ClientCard.jsx` вкладки | id `loyalty`, секция+хук; у открытого ПНК **скрыть** (`isPnkCardTabVisible`: loyalty как stats — нет) |
| Список тренера | `TrainerClientListItem.jsx` | чип из IDB `loyalty_glance` |
| Список админ / продажи / управляющий | `AdminClients.jsx` (~строка списка `td-client-item`); `SalesClients` и `/club/clients` — тот же layout | тот же чип; glance по id страницы |
| Снимок на планшет | **не** `trainer-pull.js` | После pull: GET `loyalty-glance?ids=` пачками ≤80; IDB store `loyalty_glance` **v17** |
| Снимок карточки | только GET `loyalty-account` | **`get-client` не трогать** |
| Снимок списка админ/sales | GET `loyalty-glance` по id **текущей страницы** | не считать весь клуб |
| Списание | вкладка + сеть | кнопка sales/admin; `navigator.onLine` |
| Журнал | `App.jsx`: `/admin/loyalty`, `/sales/loyalty` | `AdminLoyaltyJournal.jsx`; пункт в шапке/дашборде продаж; `breadcrumbsCore.js` |
| Настройки | `AdminStructure.jsx` `TAB_IDS` + `?tab=loyalty` | секция ставок |
| Архив | модалка + `pushRecordCore.js` ветка `clients` | N баллов; `archived_at` → `burn_archive` |
| Переезд | `clientTrainerReassignService.js` | `club_move` + текст confirm |
| Complete / ккал | `TrainingPage.jsx` `persist`, first complete | `getSessionSamples(clientId)` из `useHeartRateSessions()` → `computeLoyaltyKcal`. **Запрещено** `hr_session.kcal_est` |
| Штамп старта | тот же `TrainingPage` + pending uuid | как migrate буфера HR |
| Стили | `src/index.css` | `@import './styles/loyalty.css'` |
| Actions | `api/admin-data.js` | switch всех `loyalty-*` |
| Lite ПЗ | вкладка «Баллы» видна | 0 и текст «нет завершённых в дневнике»; не прятать |
| Открытый ПНК | `isPnkCardTabVisible` | `loyalty` скрыть как `stats` |
| Документы ship | API, DATA_MODEL, SYNC, CHANGELOG, `PROJECT_HANDOFF_FOR_AI.md`, `agent-qa.mjs` | маршруты и actions |

### Не нужно, чтобы капало

Статистика, CQ, ЗП, челленджи, ИСКРА, Max/SMS, касса, ТЗ/АЗ, ЛК клиента, отдельный экран на главной тренера.

### Порядок включения в зале

1. Задеплоить A–C (и B вместе с complete).  
2. Админ: Структура → Лояльность → **включить** клуб.  
3. Следующая завершённая платная ПЗ после дня включения начинает цикл. Старые дневники до `enabled_at` не считаются.

---

## 13. Фазы разработки

| Фаза | Готово когда |
|------|----------------|
| **A** | ✅ verify §14 все зелёные |
| **B** | ✅ first complete пишет `data.loyalty`; pending→uuid как HR; used абона тот же |
| **C** | ✅ migration linked-готовой в репо; 403/409; redeem не в очереди |
| **D** | ✅ чип + вкладка + GET glance/account (не раздувать pull) |
| **E** | ✅ журнал и кнопка, офлайн disabled |
| **F** | ✅ архив `burn_archive` + переезд `club_move`; модалка/confirm с N; не выдумываем 0 |
| **G** | ✅ тумблер + интервалы в Структуре `?tab=loyalty`; выкл `end=as_of`; тот же день без дырки |

lint всегда. A–C + complete: `qa:local`. Склейка сервера и зала — §16. Docs ship: API, DATA_MODEL, SYNC, CHANGELOG, handoff.

---

## 16. Сервер, миграция, ошибки, проверка в зале

### Загрузка для `buildLoyaltyAccount` (Postgres, не IDB)

Кэш планшета режется (~90–120 дней) — **не** источник куша.

На GET account / glance, service role:

1. `club_loyalty_settings` клуба.
2. Клиент: `archived_at`, `trainer_id`, `club_id`.
3. Абонементы клиента + `membership_types` клуба.
4. `loyalty_ledger` клиента в этом клубе.
5. Тренировки: `client_id`, `status=completed`, `date >= coalesce(enabled_at, '1900-01-01')` (поля `id, date, status, type, data, created_at`). Не окно 90 дней pull.

Glance пачка ≤80 id. **Не** считать glance внутри `trainer-pull`.

После ручного Sync: flush → `trainer-pull` как сейчас → `loyalty-glance` для id из снимка. `loyalty_glance` **не** в `PUSH_ALLOWED_TABLES` и **не** в `PULL_MERGE_GUARD_STORE_LIST`.

### Миграция

Файл: `supabase/migrations/20260818235900_loyalty.sql` (идемпотентный). То же описание таблиц — в `schema.sql`.

`policies.sql`: RLS ON; политик для `anon` / `authenticated` **нет** (прямой PostgREST закрыт; API = service role).

`package.json`: `db:migrate:loyalty` по образцу `db:migrate:club-call-log` (`--linked` на прод). `db:migrate:pg` подхватит файл из `migrations/` на стенде C2.

**Прод (linked), 2026-08-19:** таблицы `club_loyalty_settings` и `loyalty_ledger` есть. RLS включён, политик anon нет. Программа по клубам по умолчанию **выкл**.

`loyalty_ledger` и settings **не** в sync allowlist.

IDB: `DB_VERSION` 16 → **17**, store `loyalty_glance` keyPath `client_id`.

### Тексты API (русский)

| Код | Текст |
|-----|--------|
| 403 тренер на redeem | Списать баллы может менеджер или администратор. |
| 403 чужой клиент | Нет доступа к этому клиенту. |
| 409 expected_points | Цифра устарела. Обновите карточку и спишите снова. |
| 400 программа выкл | Программа лояльности в клубе выключена. |
| 400 !can_redeem | Куш ещё нельзя списать (срок или нет баллов). |
| нет сети (UI) | Списание только при сети. |

Комментарий подарка: до 200 символов, пустой можно.

### Handoff (когда код в репо)

В `PROJECT_HANDOFF_FOR_AI.md`: маршруты `/admin/loyalty`, `/sales/loyalty`; Structure `tab=loyalty`; actions `loyalty-*`; store v17. Не описывать как кассу.

### Проверка в зале (после деплоя + migrate)

1. Включить лояльность **на одном** клубе.
2. Клиент ПЗ, не БЗ: завершить без пояса → после Sync на вкладке «Баллы» пачка за неделю.
3. С поясом и заполненным здоровьем — ккал на вкладке; если сессия длиннее часа, не копировать слепо `kcal_est` с Итога.
4. Неявка из абонемента — баллы не выросли.
5. Кнопка «Списать» у менеджера **disabled**, пока `can_redeem` ложь (три месяца на пилоте не ждать).
6. Чип списка совпадает с вкладкой после glance.
7. Архив: предупреждение в модалке; после архива idle. Restore не возвращает баллы.
8. Переезд клуба: confirm с N баллов; в новом клубе цикл с нуля.
9. Структура → Лояльность: включить клуб; выкл — сегодня ещё капает, завтра нет.

---

## 14. Verify (все обязательны)

1. БЗ/trial — false.  
2. ПЗ completed — true.  
3. `is_writeoff` при type Силовая — false.  
4. type Списание — false.  
5. Две в один день — 1 неделя.  
6. Пять в неделю — 1 пачка.  
7. 2026-09-03 + 3 → 2026-12-03, can_redeem в этот as_of.  
8. addMonthsToIso(2026-01-31, 3) → 2026-04-30.  
9. Пустая законченная неделя → idle.  
10. Текущая неделя пустая — ещё active.  
11. 250 ккал chunk 100 → 10 + remainder 50.  
12. Утро completed_at < redeem.at тот же date — не в новом цикле; вечер > at — в новом.  
13. date < enabled_at — не старт.  
14. Сэмпл вне окна не входит; cap 800.  
15. Нет loyalty.kcal — 0 ккал, неделя жива.  
16. date < club_moved_on — не в новом клубе; тот же день completed_at < move.at — нет.  
17. Два сэмпла 5 мин, max_minutes=60 → Keytel ~5 мин.  
18. date = as_of+1 — не eligible.  
19. Выкл ср (`end=as_of`): тренировка ср **ещё eligible** (§7); чт уже нет; неделя не fully enabled → не burn.  
20. Снимок 50, settings 80 — открытый цикл 50.  
21. Дырка + completed с датой дырки → снова тот же cycle_start (не miss_restart).  
22. Redeem, дырка, тренировка **после** дырки без заполнения дырки → новый cycle_start = дата этой тренировки (не дата redeem).  
23. Удалили первую тренировку цикла (origin не redeem) → cycle_start сдвигается.  
24. enabled false → can_redeem false, points как были.  
25. Смешанная неделя не burn.  
26. chunk нормализуется с 0 до 1, нет NaN.  
27. Два hard в один at: archive побеждает redeem.  
28. Restore: burn_archive остаётся, цикл с первой тренировки после at.  
29. Один HR сэмпл — длительность 5 с, не 60 мин.  
30. applyProgramToggle выкл и вкл в тот же as_of — один открытый интервал, не дырка.  
31. `archived_at` задан → idle, даже если есть redeem и тренировки.  
32. После «Вернуть» (`archived_at` null) origin = burn_archive, цикл с первой тренировки после `at`.  
33. `assertRedeemAllowed({ expected, points, can_redeem })` — false если !can_redeem или expected !== points.

Кейс 33 — чистая функция рядом с account, не HTTP.

---

## 15. Не в этом коде

ТЗ/АЗ, каталог, SMS, сторно, supervisor redeem, ИСКРА, планёрка, KPI статистики, склад, касса, cron «сжечь в пн 00:00».

---

## История

| Дата | Что |
|------|-----|
| 2026-08-19 | Фаза G: Структура `?tab=loyalty`, тумблер/ставки, интервалы только через toggle |
| 2026-08-19 | Фаза F: архив/переезд → ledger на сервере; предупреждение N в модалке/confirm |
| 2026-08-19 | Фаза C: таблицы + admin-data loyalty-* + verify 403/409 |
| 2026-08-19 | Фаза B: штамп `data.loyalty` на first complete + verify persist |
| 2026-08-18 | Фаза A: чистые функции + verify §14 зелёный |
| 2026-08-18 | Годен к разработке: is_writeoff, рестарт после пропуска, архив в входе функции, схема, 33 verify |
| 2026-08-18 | Склейка: glance не в pull, get-client не трогать, сэмплы HR, migrate/RLS, ошибки, смоук в зале |
