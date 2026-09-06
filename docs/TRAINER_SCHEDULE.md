# Ежедневник тренера (расписание персоналок)

**Актуально:** 2026-09-06  
**Статус:** ✅ MVP в коде (тренер, планшет, офлайн + sync)  
**Не:** Google Calendar как источник правды; групповые слоты; запись клиентом из ЛК (позже).

Связано: [PRODUCT_MODULES.md](./PRODUCT_MODULES.md), [SYNC.md](./SYNC.md), [DATA_MODEL.md](./DATA_MODEL.md), [DDX_PARITY_MAP.md](./DDX_PARITY_MAP.md) п.9–12.

---

## Ситуация

Тренер в зале планирует день: кому во сколько, личные пометки, несколько клиентов в один час. Сейчас — Excel/заметки/Google у каждого. Нужна **одна правда в Ядре**, чтобы позже клиентское приложение показывало «моя следующая тренировка» из тех же записей.

## MVP (фаза 1)

| Что | Как |
|-----|-----|
| Кто создаёт | Только **тренер** на планшете |
| UX | Как Google Calendar: **месяц** → тап по **дню** → сетка по часам. Режимы: **День / 3 дня / Неделя / Месяц**; в дневных режимах стрелки «назад/вперёд»; сетка **00:00–23:00**, при открытии скролл к ~07:00 |
| Запись в слот | **Заметка** (текст) **или** один/несколько **клиентов** тренера |
| Офлайн | IndexedDB + `sync_queue` → `push-record` |
| Pull | `trainer-pull`, окно −30…+120 дней от «сегодня» (МСК) |
| Связь с тренировкой | `linked_training_id` + «Начать / Продолжить» — см. фазу 2 |

## Как открыть (тренер)

| Где | Что |
|-----|-----|
| Главная `/trainer` | Плитка **Ежедневник** рядом с **Клиенты** и **Профиль** |
| Шапка | Пункт в верхнем меню и в бургер-меню (иконка календаря) |
| Прямой URL | `/trainer/calendar` |

**Планшет / сетка плиток:** на главной в режиме «доски» (`trainer-home--board`, ≥768px) три раздела всегда в **один ряд** (`repeat(3, …)`). Раньше сетка была на две колонки (под Клиенты/Профиль) — на широком планшете «Ежедневник» уезжал вниз. После деплоя на планшете нужно жёсткое обновление PWA ([PWA.md](./PWA.md)).

## Сущность `trainer_schedule_entries`

| Поле | Тип | Смысл |
|------|-----|--------|
| `id` | UUID | PK |
| `club_id` | UUID | Клуб |
| `trainer_id` | UUID | Тренер-владелец |
| `day_date` | DATE | Календарный день (МСК) |
| `start_minutes` | INT | Минуты от полуночи (0–1439) |
| `duration_minutes` | INT | Длительность, по умолчанию 60 |
| `title` | TEXT | Текст заметки (если без клиентов) |
| `client_ids` | JSONB | Массив UUID клиентов (0…10) |
| `linked_training_id` | UUID? | Связь с `trainings` (опционально) |
| `created_at` / `updated_at` | TIMESTAMPTZ | Ревизия / merge при pull |

**Правило отображения:** если `client_ids` не пуст — заголовок из имён клиентов; иначе `title` или «Заметка».

## Код

| Слой | Путь |
|------|------|
| Правила, сетка месяца, время | `src/lib/trainer/trainerScheduleCore.js` |
| IDB + sync | `src/lib/trainer/trainerScheduleService.js` |
| Связь с `trainings` | `src/lib/trainer/trainerScheduleTrainingCore.js`, `trainerScheduleTrainingService.js` |
| Push payload | `src/lib/trainer/trainerSchedulePushPayload.js` |
| Экран | `src/pages/trainer/TrainerCalendarPage.jsx` |
| Админ / управляющий | `src/pages/admin/ClubTrainerSchedulePage.jsx` |
| Admin API | `api/_lib/adminData/trainerScheduleHandler.js`, `src/lib/admin/trainerScheduleAdminCore.js` |
| UI-блоки | `src/components/trainer/TrainerSchedule*.jsx` (`ViewSwitcher`, `MultiDayAgenda`, месяц) |
| Стили | `src/styles/trainer-schedule.css` |
| Verify | `verify-trainer-schedule-core.mjs`, `verify-trainer-schedule-training-core.mjs` |

## Безопасность

- Push: **только тренер** (`trainerSchedulePushAuthCore.js`) — не admin/supervisor/manager; свой `trainer_id`, свой `club_id`, каждый `client_id` через `canAccessClient`, `linked_training_id` только на свою тренировку.
- Read API: `trainer-schedule` — admin / supervisor (`requireAdminOrSupervisor`), фильтр по клубу и списку тренеров клуба.
- Pull: `trainer-pull` — только `trainer_id` из JWT + `club_id` тренера.
- RLS: тренер — CRUD своих строк; админ — all (PostgREST); supervisor — только через API (service role).

## Фаза 2 (✅ в коде)

- Кнопка **«Начать / Продолжить тренировку»** на слоте с клиентом (день и модалка).
- Несколько клиентов — выбор, с кого начать.
- После первого сохранения черновика — `linked_training_id` на слоте (параметр URL `scheduleEntry`).
- Sync: `trainings` раньше `trainer_schedule_entries` (волны push); ошибка «тренировка пока не в облаке» **не** снимает слот с очереди.
- Чип статуса: «Черновик тренировки» / «Тренировка завершена».

## Фаза 2b — админ и управляющий (✅ в коде)

| Что | Как |
|-----|-----|
| Кто смотрит | **Админ** (любой клуб) и **управляющий** (свой клуб) |
| Режим | **Только просмотр** — редактирует тренер на планшете |
| API | `GET admin-data?action=trainer-schedule&club_id=&day_from=&day_to=&trainer_id=` |
| UX | Месяц → день; фильтр «все тренеры» / один тренер; имя тренера на слоте |
| Маршруты | `/admin/trainer-schedule`, `/club/trainer-schedule` |

## Фаза 3 (не в MVP)

- Клиентское приложение: read-only «ближайшие»
- Экспорт в Google Calendar (one-way)
- Drag-and-drop перенос слота
