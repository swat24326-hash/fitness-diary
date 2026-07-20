# ИСКРА — архитектура самообучения

Расширяемый контур: собираем сигналы → агрегируем → улучшаем подсказки и промпт без ломки офлайн-first и лимита Vercel functions.

**Цель:** умнеть **для клуба и владельца** сама из диалога — не через обязательный поход в настройки. Настройки playbooks — аварийный люк.

## Модель (слои A–D)

| Слой | Смысл | Статус |
|------|--------|--------|
| **A** Фразы («короче», «не то», «запомни…») | Детект → `preference` / правка в промпт | ✅ v1 `iskraOwnerFeedbackDetectCore.js` |
| **B** Уточняющие вопросы от ИСКРЫ | Редко, по триггеру → строка «Уточню:» | ✅ v1 `iskraClarifyingCore.js` |
| **C** Память владельца | `ПРАВКИ ВЛАДЕЛЬЦА` + уроки клуба в промпте | ✅ v1 (correction note + preference) |
| **D** Дела (назначил / закрыл совет) | Планёрка → `dispatch_*` сигналы | ✅ v1 `iskraDispatchLearningCore.js` |

## Статус (2026)

| Слой | Статус |
|------|--------|
| Сбор сигналов (👍/👎, клики чипов и подсказок) | **Активен** — localStorage + async API |
| Ранжирование проактивных подсказок | **Активен** — локально по score |
| Playbooks в промпте Gemini | **Активен** — `phase: apply` |
| Correction / preference → `playbook_note` → промпт | **Активен** — блок «ПРАВКИ ВЛАДЕЛЬЦА» |
| NL-детект фраз в чате (админ JARVIS) | **Активен** — при generate |
| Уточняющие вопросы («Уточню:») | **Активен** — periodic / course / negative |
| Планёрка → learning (`dispatch_assign/done/dismiss`) | **Активен** — при create / update_status |
| Исход совета (baseline → Δ план/₽) | **Активен** — `iskraAdviceOutcomeCore.js` + prefetch |
| Неделание (dismiss брифа / игнор карточек) | **Активен** — `inaction_dismiss` |
| Голос → память | **Активен** — `input_channel: voice` + preference |
| Вы vs прошлый вы | **Активен** — `iskraPastSelfCore.js` |
| Потолок модели % | **Активен** — `iskraModelCeilingCore.js` |
| Качество ведения в контексте | **Активен** — промпт + алерт (brief опционально) |
| Ответ на «Уточню:» | **Активен** — в память владельца |
| Бриф собственника (печать/PDF) | **Активен** — кнопка «Бриф» в панели |
| Облачная агрегация | **Миграция** `club_iskra_learning_signals` |
| A/B интро и авто-playbook | **План** (`phase: full`) |

Фаза: `ISKRA_LEARNING_PHASE = 'apply'` в `iskraLearningCore.js` (`collect` | `apply` | `full`).

## Поток данных

```
UI (👍/👎, hint, chip)
  → iskraLearningService.recordIskraLearningFeedback
  → iskraLearningStore (localStorage, офлайн)
  → POST admin-data?action=iskra-learning (если online)
  → club_iskra_learning_signals (upsert score)

Gemini POST
  → loadClubLearningBundle
  → mergeLearningIntoPromptAppend (уроки клуба)
  → ответ + learning_meta
```

Клиент для дока читает **локальный** bundle; сервер для промпта — **облачный** (после миграции). При отсутствии таблицы API отвечает `stored: false, reason: migration_pending` — приложение не падает.

## Типы событий

| event_type | Вес | Назначение |
|------------|-----|------------|
| `feedback_up` | +1 | Ответ полезен |
| `feedback_down` | −1.2 | Ответ не помог |
| `hint_click` | +0.6 | Клик проактивной подсказки |
| `chip_click` | +0.5 | Быстрая кнопка |
| `correction` | −0.8 | «Исправить ответ» — note → память владельца |
| `preference` | +1.5 | Фраза в чате («короче», «запомни…») |
| `dispatch_assign` | +1.2 | Назначили задание из совета |
| `dispatch_done` | +2 | Задание выполнено |
| `dispatch_dismiss` | −1 | Скрыто / отклонено |
| `advice_baseline` | 0 | Зафиксирован план/₽ на момент совета |
| `advice_outcome` | ± | Δ план/₽ после совета |
| `inaction_dismiss` | −0.9 | Закрыли бриф / часто видели карточку без действия |
| `playbook_confirm` | +2 | Подтверждённый урок клуба |

Ключ сигнала: `hint:plan_behind`, `chip:advice`, `topic:plan`, `reply:freeform`.

## Слои кода

```
iskraLearningCore.js            — события, score, playbooks, ранжирование
iskraInactionLearningCore.js    — dismiss / игнор → уроки
iskraPastSelfCore.js            — «вы vs прошлый вы»
iskraModelCeilingCore.js        — честный % надёжности
iskraCoachQualityPromptCore.js  — связка с «Качеством ведения»
iskraLearningPipeline.js        — bundle → prompt → hints
iskraLearningStore.js           — localStorage (клиент)
iskraLearningService.js         — запись + sync API
api/_lib/iskraLearningHandler.js — upsert в Supabase
```

Интеграция:
- `geminiAnalyticsHandler.js` — playbooks в `prompt_append`
- `GeminiAnalyticsPanel.jsx` — 👍/👎, учёт кликов
- `iskraProactiveHints.js` + `rankHintsWithLearning`

## Playbooks

Автопродвижение (без ручного подтверждения), если:
- `positive_count >= 3`
- `score >= 2.5`

Текст попадает в блок `УРОКИ КЛУБА` в промпте. Ручное подтверждение — `playbook_confirm` + `note` (UI позже, в AdminIskraSettings).

## Включение облака

1. Применить `supabase/migrations/20260709120000_club_iskra_learning.sql`
2. Убедиться, что `POST ?action=iskra-learning` возвращает `stored: true`
3. При необходимости сменить фазу на `full` (A/B интро, ротация чипов по score)

## Будущее (без нового endpoint)

- Редактор playbooks в **Настройки ИСКРА** ✅ (`IskraPlaybooksSection`, GET `iskra-learning`)
- Слияние local + cloud bundle при prefetch
- Кэш ответов с учётом `learning_playbooks` revision
- Роль советника в ключе сигнала (`advisor_role_id` уже в событии)

## Verify

```bash
node scripts/verify-iskra-learning.mjs
```

Связанный документ: [ISKRA_ADVISOR_ARCHITECTURE.md](./ISKRA_ADVISOR_ARCHITECTURE.md)
