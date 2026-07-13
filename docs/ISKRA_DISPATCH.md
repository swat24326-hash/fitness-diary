# ИСКРА Dispatch — сообщения и задания сотрудникам (v1)

**Статус:** реализовано (2026-07) — MVP **Планёрки** (рабочее название; раньше «Пульс команды»).  
**API:** `admin-data?action=iskra-dispatch`  
**Таблица:** `club_iskra_dispatch`

---

## Что умеет v1

| Роль | Действие |
|------|----------|
| **Админ** | Кнопка **«Тренеру»** → задача с типом, приоритетом, **дедлайном** |
| **Тренер** | Inbox: **Принял → Выполнено / Не могу**, дедлайн, кнопка **Перейти** |

Статусы: `pending` → `seen` → `accepted` → `done` | `declined` | `dismissed`

---

## Поток

```
InsightCard → buildDispatchFromInsightCard → IskraDispatchModal → POST iskra-dispatch
                                                                    ↓
                                              club_iskra_dispatch (Supabase)
                                                                    ↓
                                    TrainerInboxPanel ← GET iskra-dispatch (inbox)
```

---

## Схема

```sql
club_iskra_dispatch (
  club_id, sender_user_id, recipient_user_id,
  kind: message | task,
  status: pending | done | dismissed,
  title, body,
  source: iskra_insight | iskra_manual | admin,
  insight_key, period_year, period_month,
  created_at, updated_at, completed_at
)
```

RLS: админ — полный доступ; тренер — read/update своих (`recipient_user_id = auth.uid()`).

---

## Файлы

| Слой | Путь |
|------|------|
| Core | `src/lib/admin/iskraDispatchCore.js` |
| Client API | `src/lib/admin/iskraDispatchService.js` |
| Handler | `api/_lib/iskraDispatchHandler.js` |
| UI админ | `src/components/iskra/IskraDispatchModal.jsx` |
| UI тренер | `src/components/iskra/TrainerInboxPanel.jsx` |
| Verify | `scripts/verify-iskra-dispatch.mjs` |
| Миграция | `supabase/migrations/20260713120000_club_iskra_dispatch.sql` |

---

## Деплой миграции

```bash
npm run db:migrate:iskra -- --linked
```

---

## Дальше (v2 — см. ISKRA_PLANERKA.md)

- Роль **управляющий** как отправитель
- Статусы seen → accepted
- Авто-задания по триггерам
- Deep-link на экран действия
- Сигналы в learning (`task_sent`, `task_done`)
- Web Push

---

## Связанные документы

- [ISKRA_PLANERKA.md](./ISKRA_PLANERKA.md)
- [CLUB_OPERATIONS_PLAN.md](./CLUB_OPERATIONS_PLAN.md) — O1, ручные задания
- [ISKRA_NORTH_STAR.md](./ISKRA_NORTH_STAR.md) — Эпик F
