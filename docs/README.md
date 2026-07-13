# Документация fitness-diary (FIT-CITY)

Карта файлов в `docs/`. Правила для Cursor — в `.cursor/rules/` (не дублируем здесь).

**С чего начать:** [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) — полный контекст проекта для нового чата или разработчика.

---

## Операционка (релиз, деплой, инциденты)

| Файл | Когда читать |
|------|--------------|
| [DEPLOY.md](./DEPLOY.md) | Первый выклад в интернет (полная инструкция) |
| [SUPABASE_FIRST_DEPLOY.md](./SUPABASE_FIRST_DEPLOY.md) | Краткая шпаргалка: env + schema + RLS |
| [RELEASE.md](./RELEASE.md) | Чеклист перед merge и prod-деплоем |
| [RUNBOOK.md](./RUNBOOK.md) | Типовые инциденты: sync, PWA, клубы ≠ облако, статистика |
| [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md) | Auth, RLS, `users.id` перед крупным клубом |
| [DEEP_AUDIT.md](./DEEP_AUDIT.md) | Глубокий аудит критических зон перед релизом |
| [MEMORIES.md](./MEMORIES.md) | Журнал findings аудита (закрытые / отклонённые) |

---

## Масштаб и коммерция

| Файл | Когда читать |
|------|--------------|
| [COMMERCIAL_ROADMAP.md](./COMMERCIAL_ROADMAP.md) | Фазы 0–4: что сделано и ongoing |
| [ROADMAP_MULTI_CLUB_AND_PAID.md](./ROADMAP_MULTI_CLUB_AND_PAID.md) | 2+ клубов и платные тарифы |
| [DATA_VOLUME.md](./DATA_VOLUME.md) | Оценка объёма БД, пороги pull-by-period |
| [GROWTH_PLAYBOOK.md](./GROWTH_PLAYBOOK.md) | Журнал метрик клуба, когда переходить на Pro |
| [PAID_TIER_MIGRATION.md](./PAID_TIER_MIGRATION.md) | Переход Vercel/Supabase на платные тарифы |
| [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) | Архив клиентов: поведение sync и UI |

---

## ИСКРА (AI-советник админки)

| Файл | Статус | Назначение |
|------|--------|------------|
| [ISKRA_NORTH_STAR.md](./ISKRA_NORTH_STAR.md) | цель | Куда идём: метрики, вау, приоритеты |
| [ISKRA_ADVISOR_ARCHITECTURE.md](./ISKRA_ADVISOR_ARCHITECTURE.md) | shipped | Пайплайн ответа, Gemini, контекст клуба |
| [ISKRA_DISPATCH.md](./ISKRA_DISPATCH.md) | shipped | Задания тренерам из инсайтов |
| [ISKRA_PLANERKA.md](./ISKRA_PLANERKA.md) | shipped | Планёрка / пульс команды |
| [ISKRA_SELF_LEARNING.md](./ISKRA_SELF_LEARNING.md) | shipped | 👍/👎 и дообучение на фидбеке |
| [ISKRA_PRO.md](./ISKRA_PRO.md) | shipped | Упаковка Pro внутри FIT-CITY |
| [ISKRA_CURATOR.md](./ISKRA_CURATOR.md) | план C0+ | Личный куратор: привычки, здоровье, собеседник |

---

## Продуктовые планы (роли, не ops)

| Файл | Назначение |
|------|------------|
| [CLUB_OPERATIONS_PLAN.md](./CLUB_OPERATIONS_PLAN.md) | Операции клуба в продукте |
| [RELAY_OPERATIONS.md](./RELAY_OPERATIONS.md) | Relay / передача смен |
| [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md) | Роль управляющего клуба |
| [SALES_MANAGER.md](./SALES_MANAGER.md) | Роль менеджера продаж |

---

## Как обновлять

1. **Фича shipped** → статус и API в соответствующем `ISKRA_*.md` (или новый doc по образцу).
2. **Новый инцидент на проде** → § в [RUNBOOK.md](./RUNBOOK.md).
3. **Смена архитектуры / структуры каталогов** → [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md).
4. **Новый doc** → строка в этот README.

Правила кода и ship: `.cursor/rules/fitness-diary-architecture.mdc`, `fitness-diary-ship.mdc`.
