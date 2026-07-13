# ИСКРА Dispatch — сообщения и задания сотрудникам (v1)

**Статус:** реализовано (2026-07) — MVP **Планёрки** + виджет на главной, push, пошаговые кнопки.  
**API:** `admin-data?action=iskra-dispatch`, `admin-data?action=push-subscription`  
**Таблицы:** `club_iskra_dispatch`, `user_push_subscriptions`

---

## Что умеет сейчас

| Роль | Действие |
|------|----------|
| **Админ** | Планёрка: задание **Один / Все**, приоритет, срок, текст (тип — только у ИСКРЫ) |
| **Тренер** | Виджет на главной (свайп), inbox: **шаг 1 Принял → шаг 2 Выполнено**, «Не могу», **Перейти** |
| **Тренер (online)** | Web Push при новом задании; подписка в **Профиль** |

Статусы: `pending` → `seen` → `accepted` → `done` | `declined` | `dismissed`

---

## Поток

```
Админ / ИСКРА → IskraDispatchModal → POST iskra-dispatch
                                          ↓
                            club_iskra_dispatch + push (если VAPID)
                                          ↓
              TrainerTaskGlanceWidget (главная) + TrainerInboxPanel (шапка)
```

---

## Файлы

| Слой | Путь |
|------|------|
| Core | `src/lib/admin/iskraDispatchCore.js`, `iskraDispatchInboxActionsCore.js` |
| Progress | `iskraDispatchProgressCore.js`, `DispatchTaskProgressBar.jsx` |
| Push | `src/lib/push/`, `api/_lib/webPushCore.js`, `public/push-sw.js` |
| Client API | `iskraDispatchService.js` |
| Handler | `api/_lib/iskraDispatchHandler.js`, `pushSubscriptionHandler.js` |
| UI админ | `IskraDispatchModal.jsx`, `AdminClubTasks.jsx` |
| UI тренер | `TrainerTaskGlanceWidget.jsx`, `TrainerInboxPanel.jsx`, `TrainerPushPrompt.jsx` |
| Verify | `verify-iskra-dispatch.mjs`, `verify-trainer-push.mjs` |

---

## Деплой

```bash
npm run db:migrate:iskra -- --linked   # dispatch + push subscriptions
```

Push на проде: [PUSH_SETUP.md](./PUSH_SETUP.md) (VAPID в Vercel).

---

## Дальше (v2 — см. ISKRA_PLANERKA.md)

- Роль **управляющий** как отправитель
- Авто-задания по триггерам
- Сигналы в learning (`task_sent`, `task_done`)
- Эскалация просрочки

---

## Связанные документы

- [ISKRA_PLANERKA.md](./ISKRA_PLANERKA.md)
- [PUSH_SETUP.md](./PUSH_SETUP.md)
- [CLUB_OPERATIONS_PLAN.md](./CLUB_OPERATIONS_PLAN.md)
- [ISKRA_NORTH_STAR.md](./ISKRA_NORTH_STAR.md)
