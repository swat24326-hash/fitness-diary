# Документация fitness-diary (**Ось**)

Карта файлов в `docs/`. Правила для Cursor — в `.cursor/rules/` (не дублируем политику здесь).

**С чего начать:** [PRODUCT_VISION.md](./PRODUCT_VISION.md) — крупная цель → [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) — продукт Ось vs клуб FIT-CITY → [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) — что в коде сегодня.

**Системная карта (тонкие доки):** [API.md](./API.md) · [SYNC.md](./SYNC.md) · [DATA_MODEL.md](./DATA_MODEL.md) · [TESTING.md](./TESTING.md) · [PWA.md](./PWA.md)

Также в корне: [CHANGELOG.md](../CHANGELOG.md) (заметки для зала), [CONTRIBUTING.md](../CONTRIBUTING.md) (как вносить изменения).

---

## Операционка (релиз, деплой, инциденты)

| Файл | Когда читать |
|------|--------------|
| [DEPLOY.md](./DEPLOY.md) | Первый выклад в интернет (полная инструкция) |
| [SUPABASE_FIRST_DEPLOY.md](./SUPABASE_FIRST_DEPLOY.md) | Краткая шпаргалка: env + schema + RLS |
| [RELEASE.md](./RELEASE.md) | Чеклист перед merge и prod-деплоем |
| [RUNBOOK.md](./RUNBOOK.md) | Типовые инциденты: sync, PWA, клубы ≠ облако, статистика |
| [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md) | Auth, RLS, `users.id` перед крупным клубом |
| [PUSH_SETUP.md](./PUSH_SETUP.md) | Web Push / VAPID (планёрка, задания) |
| [MOIZVONKI_SETUP.md](./MOIZVONKI_SETUP.md) | Клубные SMS через «Мои Звонки» (env + MVP) |
| [PWA.md](./PWA.md) | Установка на планшет, SW, обновление после деплоя |
| [PAID_TIER_MIGRATION.md](./PAID_TIER_MIGRATION.md) | Переход Vercel/Supabase на платные тарифы |
| [DEEP_AUDIT.md](./DEEP_AUDIT.md) | Глубокий аудит критических зон перед релизом |
| [MEMORIES.md](./MEMORIES.md) | Журнал findings аудита |

---

## Архитектура и качество

| Файл | Когда читать |
|------|--------------|
| [API.md](./API.md) | Каталог `api/*.js` и `admin-data?action=` |
| [SYNC.md](./SYNC.md) | Очередь, flush → pull, allowlist таблиц |
| [DATA_MODEL.md](./DATA_MODEL.md) | IDB stores ↔ сущности ↔ Postgres |
| [TESTING.md](./TESTING.md) | `lint` / `qa:local` / verify / когда писать тест |

---

## Масштаб и коммерция

| Файл | Когда читать |
|------|--------------|
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | **Тип продукта / крупная цель:** ОС клуба, слои L0–L4, качество и инженерный каркас |
| [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) | **Фирменный стиль:** Whoop-опора, ролевые цвета, токены, driving prompt |
| [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md) | Стратегия + РФ: курс **C2 + Yandex**; чеклист владельца до стенда §5.4.0; security после переезда §5.7 |
| [COMMERCIAL_ROADMAP.md](./COMMERCIAL_ROADMAP.md) | Фазы 0–4: что сделано и ongoing |
| [ROADMAP_MULTI_CLUB_AND_PAID.md](./ROADMAP_MULTI_CLUB_AND_PAID.md) | 2+ клубов и платные тарифы |
| [DATA_VOLUME.md](./DATA_VOLUME.md) | Оценка объёма БД, пороги pull-by-period |
| [GROWTH_PLAYBOOK.md](./GROWTH_PLAYBOOK.md) | Журнал метрик клуба, когда переходить на Pro |
| [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) | Архив клиентов: sync и UI |
| [OUTREACH_CHANNELS_ROADMAP.md](./OUTREACH_CHANNELS_ROADMAP.md) | Max ✅ + SMS «Мои Звонки» MVP |

---

## ИСКРА (AI-советник админки)

| Файл | Статус | Назначение |
|------|--------|------------|
| [ISKRA_NORTH_STAR.md](./ISKRA_NORTH_STAR.md) | цель | Куда идём: метрики, вау, приоритеты |
| [ISKRA_ADVISOR_ARCHITECTURE.md](./ISKRA_ADVISOR_ARCHITECTURE.md) | shipped | Пайплайн ответа, Gemini, контекст клуба |
| [ISKRA_DISPATCH.md](./ISKRA_DISPATCH.md) | shipped | Задания тренерам из инсайтов |
| [ISKRA_PLANERKA.md](./ISKRA_PLANERKA.md) | shipped | Планёрка / пульс команды |
| [ISKRA_SELF_LEARNING.md](./ISKRA_SELF_LEARNING.md) | shipped | 👍/👎 и дообучение |
| [ISKRA_PRO.md](./ISKRA_PRO.md) | shipped | Упаковка Pro внутри FIT-CITY |
| [ISKRA_CURATOR.md](./ISKRA_CURATOR.md) | план C0+ | Личный куратор |
| [iskra-kb/](./iskra-kb/README.md) | KB | Короткие how-to; **источник правды = JS**, md — копия |

`ISKRA_STAFF_PULSE.md` — устаревшее имя; читать [ISKRA_PLANERKA.md](./ISKRA_PLANERKA.md).

---

## Продукт (роли и фичи)

| Файл | Статус | Назначение |
|------|--------|------------|
| [PNK_FUNNEL.md](./PNK_FUNNEL.md) | ✅ в проде | Воронка ПНК: менеджер → тренер → KPI |
| [COACH_QUALITY.md](./COACH_QUALITY.md) | ✅ MVP | Качество ведения тренера: care / depth / хвосты базы |
| [TRAINING_HR.md](./TRAINING_HR.md) | ✅ MVP | Пульс BLE в шапке (зоны/reconnect) + сводка на Итоге |
| [PRODUCT_MODULES.md](./PRODUCT_MODULES.md) | карта | Питание, ДЗ, outreach, ИСКРА — куда код и docs |
| [SALES_MANAGER.md](./SALES_MANAGER.md) | ✅ роль/отчёт в проде; ТЗ — справочник | Менеджер продаж + финансы |
| [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md) | 📋 ТЗ | Управляющий клуба (ещё не роль в коде) |
| [CLUB_OPERATIONS_PLAN.md](./CLUB_OPERATIONS_PLAN.md) | план | Операции клуба в продукте |
| [RELAY_OPERATIONS.md](./RELAY_OPERATIONS.md) | stub | Внешний «Релей» отложен |

---

## Как обновлять

Правило агента и DoD: **`.cursor/rules/fitness-diary-docs.mdc`**.

1. **Фича shipped** → статус в соответствующем doc + при заметном UX — `CHANGELOG.md`.
2. **Новый инцидент на проде** → § в [RUNBOOK.md](./RUNBOOK.md).
3. **Смена архитектуры / ролей / API** → [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) и API/SYNC/DATA_MODEL.
4. **Новый endpoint / action** → [API.md](./API.md).
5. **Новая таблица sync** → [SYNC.md](./SYNC.md) + [DATA_MODEL.md](./DATA_MODEL.md).
6. **Новый doc** → строка в этот README.

Правила кода: `.cursor/rules/fitness-diary-architecture.mdc`, `fitness-diary-ship.mdc`.
