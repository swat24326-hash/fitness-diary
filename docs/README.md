# Документация fitness-diary (**Ядро**)

Карта файлов в `docs/`. Правила для Cursor — в `.cursor/rules/` (не дублируем политику здесь).  
Системная карта (API / SYNC / DATA_MODEL / DEPLOY / handoff) сверена с кодом **2026-09-01**.

**С чего начать:** [AGENT_PLAYBOOK.md](./AGENT_PLAYBOOK.md) — маршрут для агента (новый чат) → [PRODUCT_VISION.md](./PRODUCT_VISION.md) — крупная цель → [PATH_TO_GOAL.md](./PATH_TO_GOAL.md) — очередь → [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) — что в коде → карта ниже.

**Системная карта (тонкие доки):** [AGENT_PLAYBOOK.md](./AGENT_PLAYBOOK.md) · [CODE_TRACE.md](./CODE_TRACE.md) · [API.md](./API.md) · [SYNC.md](./SYNC.md) · [DATA_MODEL.md](./DATA_MODEL.md) · [TESTING.md](./TESTING.md) · [PWA.md](./PWA.md) · [ENGINEERING_MATURITY.md](./ENGINEERING_MATURITY.md)

---

## Для агента Cursor

| Файл | Когда |
|------|--------|
| [AGENT_PLAYBOOK.md](./AGENT_PLAYBOOK.md) | **Первый** вход в новый чат: тип задачи → docs → rules → verify |
| [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) | Роли, стек, каталоги, env |
| [INCIDENTS.md](./INCIDENTS.md) | Жалоба / баг / повтор (коды A–Q) |
| [CODE_TRACE.md](./CODE_TRACE.md) | Код направления → пути в `src/` и `api/` |
| [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) | Критический путь зала |

Также в корне: [CHANGELOG.md](../CHANGELOG.md) (заметки для зала), [CONTRIBUTING.md](../CONTRIBUTING.md) (как вносить изменения).

---

## Операционка (релиз, деплой, инциденты)

| Файл | Когда читать |
|------|--------------|
| [DEPLOY.md](./DEPLOY.md) | Первый выклад в интернет (полная инструкция) |
| [SUPABASE_FIRST_DEPLOY.md](./SUPABASE_FIRST_DEPLOY.md) | Краткая шпаргалка: env + schema + RLS |
| [RELEASE.md](./RELEASE.md) | Чеклист перед merge и prod-деплоем |
| [RUNBOOK.md](./RUNBOOK.md) | **Что делать сейчас:** sync, PWA, клубы ≠ облако (процедуры) |
| [INCIDENTS.md](./INCIDENTS.md) | **Журнал кейсов:** контуры (зал / админ / продажи / связь / инфра) + коды A–Q; ведёт агент по чату |
| [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md) | Auth, RLS, `users.id` перед крупным клубом |
| [PUSH_SETUP.md](./PUSH_SETUP.md) | Web Push / VAPID (планёрка, задания) |
| [MOIZVONKI_SETUP.md](./MOIZVONKI_SETUP.md) | Клубные SMS и звонки «Мои Звонки»: **в проде** + журнал связи (список/сводка/SMS) |
| [PWA.md](./PWA.md) | Установка на планшет, SW, обновление после деплоя |
| [PAID_TIER_MIGRATION.md](./PAID_TIER_MIGRATION.md) | Переход Vercel/Supabase на платные тарифы |
| [DEEP_AUDIT.md](./DEEP_AUDIT.md) | Глубокий аудит критических зон перед релизом |
| [MEMORIES.md](./MEMORIES.md) | Журнал findings аудита |

---

## Архитектура и качество

| Файл | Когда читать |
|------|--------------|
| [API.md](./API.md) | Каталог `api/*.js` и `admin-data?action=` |
| [SYNC.md](./SYNC.md) | Очередь, flush → pull, allowlist; черновик durable / удаление (§3a–3d) |
| [DATA_MODEL.md](./DATA_MODEL.md) | IDB stores ↔ сущности ↔ Postgres |
| [TESTING.md](./TESTING.md) | `lint` / `qa:critical` / `qa:local` / verify / когда писать тест |
| [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) | План проверки критического контура + ручной чеклист |
| [ENGINEERING_MATURITY.md](./ENGINEERING_MATURITY.md) | Уровень разработки (слои, роли, что до FitBase-класса) |

---

## Масштаб и коммерция

| Файл | Когда читать |
|------|--------------|
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | **Крупная цель:** ОС + CRM клуба; замена 1С в операционке; call-центры (§2.4); проекция цели на фичи; слои L0–L4 |
| [PATH_TO_GOAL.md](./PATH_TO_GOAL.md) | **Путь к цели:** разрывы воронки, сейчас→дальше, очередь ставок, ритуал ведения процесса агентом |
| [DDX_PARITY_MAP.md](./DDX_PARITY_MAP.md) | **Чеклист vs DDX:** что есть / частично / позже (турникет, B2C, касса, сайт…) |
| [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) | **Фирменный стиль:** Whoop-опора, ролевые цвета, токены, driving prompt |
| [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md) | Стратегия + РФ: курс **C2 + Yandex**; чеклист §5.4.0; security §5.7; продукт P1–P3 §5.8; стек/TS vs переезд **§5.9** |
| [AUTH_C2_MAP.md](./AUTH_C2_MAP.md) | Вход сейчас (Supabase) vs свой Auth на Yandex; шов `authPort` готов; JWT — по команде R2 |
| [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md) | День стенда R2: migrate:pg, portable host / Docker, smoke, QA_ORIGIN |
| [COMMERCIAL_ROADMAP.md](./COMMERCIAL_ROADMAP.md) | Фазы 0–4: что сделано и ongoing |
| [ROADMAP_MULTI_CLUB_AND_PAID.md](./ROADMAP_MULTI_CLUB_AND_PAID.md) | 2+ клубов и платные тарифы |
| [DATA_VOLUME.md](./DATA_VOLUME.md) | Оценка объёма БД, пороги pull-by-period |
| [BUNDLE_MEASURE.md](./BUNDLE_MEASURE.md) | Метрика размера JS-бандла (что тянет вес) |
| [GROWTH_PLAYBOOK.md](./GROWTH_PLAYBOOK.md) | Журнал метрик клуба, когда переходить на Pro |
| [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) | Архив клуба: sync и UI |
| [CLIENT_HALL_LIFECYCLE.md](./CLIENT_HALL_LIFECYCLE.md) | Закрытие направлений ПЗ/ТЗ/АЗ → автоархив клуба |
| [OUTREACH_CHANNELS_ROADMAP.md](./OUTREACH_CHANNELS_ROADMAP.md) | Max ✅ + SMS/звонок ✅ + журнал связи ✅ (список/сводка/учёт SMS) |
| [PRICE_LIST.md](./PRICE_LIST.md) | Прайс ПЗ по клубу (админ + облако `club_price_lists`) |

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
| [CLIENT_RETENTION.md](./CLIENT_RETENTION.md) | 📋 фаза 0 | Удержание и жизнь клиента: cohort M+3, renewal, archive, reactivation |
| [TRAINING_HR.md](./TRAINING_HR.md) | ✅ MVP | Пульс BLE в шапке (зоны/reconnect) + сводка на Итоге |
| [TRAINER_SCHEDULE.md](./TRAINER_SCHEDULE.md) | ✅ MVP | Ежедневник: вход с главной/меню, месяц → день, sync |
| [LOYALTY.md](./LOYALTY.md) | фазы A–G ✅ | Лояльность ПЗ: цикл, вкладка, списание, журнал, архив/переезд, тумблер клуба |
| [PRODUCT_MODULES.md](./PRODUCT_MODULES.md) | карта | Питание, ДЗ, outreach, ИСКРА — куда код и docs |
| [DDX_PARITY_MAP.md](./DDX_PARITY_MAP.md) | 📋 ориентир | Чеклист vs DDX: есть / частично / позже (в т.ч. турникет) |
| [SALES_MANAGER.md](./SALES_MANAGER.md) | ✅ роль/отчёт в проде; Excel = мост | Менеджер продаж + финансы |
| [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md) | ✅ шпаргалка | Как завести клиентов ПЗ (вечерний Excel — переход; MVP оплат) |
| [AZ_CLIENTS_ONBOARD.md](./AZ_CLIENTS_ONBOARD.md) | ✅ шпаргалка | Desk АЗ: сид, направления, списания; связь с доменом оплат |
| [CLIENT_MULTI_HALL.md](./CLIENT_MULTI_HALL.md) | ✅ фаза 1 в коде; migrate linked | Один client — абоны ПЗ/ТЗ/АЗ; списки, оплаты attach, ПНК |
| [CLIENT_HALL_LIFECYCLE.md](./CLIENT_HALL_LIFECYCLE.md) | ✅ фаза 1–2 (ПЗ/ТЗ/АЗ + автоархив) | Закрытие зала ≠ архив клуба; см. канон |
| [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md) | 📋 ТЗ; **⏸ код после РФ (R3+)** | Домен платежа; MVP = ПЗ + АЗ; потом касса на клуб |
| [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md) | ✅ в проде | Управляющий ≠ тренер ≠ менеджер продаж; `/club` |
| [CLUB_OPERATIONS_PLAN.md](./CLUB_OPERATIONS_PLAN.md) | план | Операции клуба в продукте |
| [RELAY_OPERATIONS.md](./RELAY_OPERATIONS.md) | stub | Внешний «Релей» отложен |

---

## Как обновлять

Правило агента и DoD: **`.cursor/rules/fitness-diary-docs.mdc`**.

1. **Фича shipped** → статус в соответствующем doc + при заметном UX — `CHANGELOG.md`.
2. **Жалоба / баг / повтор** → [INCIDENTS.md](./INCIDENTS.md) (контур + код, INC-*); агент — `fitness-diary-incidents.mdc`.
3. **Новая инструкция для зала** (как действовать при симптоме) → § в [RUNBOOK.md](./RUNBOOK.md), не история кейса.
4. **Смена архитектуры / ролей / API** → [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) и API/SYNC/DATA_MODEL.
5. **Новый endpoint / action** → [API.md](./API.md).
6. **Новая таблица sync** → [SYNC.md](./SYNC.md) + [DATA_MODEL.md](./DATA_MODEL.md).
7. **Новый doc** → строка в этот README.

Правила кода: `.cursor/rules/fitness-diary-architecture.mdc`, `fitness-diary-ship.mdc`.
