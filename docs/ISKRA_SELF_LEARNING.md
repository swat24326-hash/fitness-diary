# ИСКРА — архитектура самообучения

Расширяемый контур: собираем сигналы → агрегируем → улучшаем подсказки и промпт без ломки офлайн-first и лимита Vercel functions.

## Статус (2026)

| Слой | Статус |
|------|--------|
| Сбор сигналов (👍/👎, клики чипов и подсказок) | **Активен** — localStorage + async API |
| Ранжирование проактивных подсказок | **Активен** — локально по score |
| Playbooks в промпте Gemini | **Заложен** — при миграции и `phase: apply` |
| Облачная агрегация | **Миграция** `club_iskra_learning_signals` |
| A/B интро и авто-playbook | **План** |

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
| `correction` | −0.8 | Явная правка (будущее) |
| `playbook_confirm` | +2 | Подтверждённый урок клуба |

Ключ сигнала: `hint:plan_behind`, `chip:advice`, `topic:plan`, `reply:freeform`.

## Слои кода

```
iskraLearningCore.js       — события, score, playbooks, ранжирование
iskraLearningPipeline.js   — bundle → prompt → hints
iskraLearningStore.js      — localStorage (клиент)
iskraLearningService.js    — запись + sync API
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
