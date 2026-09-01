# Playbook агента Cursor

**Актуально:** 2026-09-01  
**Для кого:** новый чат / другая модель — **с чего начать**, куда смотреть, что не читать зря.

Политика кода — `.cursor/rules/`. Этот файл — **маршрут по задачам**, не дубль правил.

---

## 1. Три слоя (не путать)

| Слой | Где | Зачем |
|------|-----|--------|
| **Правила** | `.cursor/rules/*.mdc` | Как писать код, ship, sync, фичи |
| **Карта продукта** | `docs/`, `CHANGELOG.md` | Что в проде, API, sync, роли |
| **Журнал кейсов** | [INCIDENTS.md](./INCIDENTS.md) | Жалобы, повторы, INC-* (ведёт агент) |
| **KB ИСКРЫ** | `src/lib/admin/iskraKnowledgeBaseArticles.js` | Ответы в приложении; md — копия |

**Процедуры для зала** (что нажать сейчас) — [RUNBOOK.md](./RUNBOOK.md), не INCIDENTS.

---

## 2. Старт нового чата (порядок чтения)

| Шаг | Файл | Когда достаточно |
|-----|------|------------------|
| 1 | Этот playbook | Всегда — выбрать ветку ниже |
| 2 | [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) | Не знаешь роли, маршруты, стек, `api/_lib` |
| 3 | Узкий doc из §3 | Конкретная зона (sync, API, продажи…) |
| 4 | `.cursor/rules/` по задаче | Перед кодом (см. §4) |

Не читать подряд все 50+ файлов `docs/` — только ветка задачи.

---

## 3. Маршрутизатор по типу задачи

| Ситуация | Сначала | Правила | Проверки |
|----------|---------|---------|----------|
| **Жалоба / баг / «опять сломалось»** | [INCIDENTS.md](./INCIDENTS.md) §5–6 → [CODE_TRACE.md](./CODE_TRACE.md) | `fitness-diary-incidents.mdc`, `fitness-diary-fix-comprehensive.mdc`, `fitness-diary-stability.mdc` | Код направления → verify из TESTING; критический путь → `qa:critical` |
| **Sync, очередь, pull, планшет** | [SYNC.md](./SYNC.md), [RUNBOOK.md](./RUNBOOK.md) §1 | `fitness-diary-sync.mdc` | `qa:local` или `verify-sync-*` |
| **Черновик / Закончить / абон** | INCIDENTS **A** / **B** / **C** | `fitness-diary-stability.mdc`, `fitness-diary-domain.mdc` | `npm run qa:critical`, [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) |
| **Статистика / agg / ИСКРА** | [COACH_QUALITY.md](./COACH_QUALITY.md), API agg в handoff | `fitness-diary-domain.mdc` | `verify-stats-agg-parity`, `verify-club-*` |
| **Продажи / прогноз / Excel** | [SALES_MANAGER.md](./SALES_MANAGER.md) | `fitness-diary-scale.mdc` | `verify-sales-*`, `verify-club-finance-*` |
| **Новая фича** | [PATH_TO_GOAL.md](./PATH_TO_GOAL.md), [PRODUCT_VISION.md](./PRODUCT_VISION.md) | `fitness-diary-features.mdc` → architecture, file-structure | lint + verify по ветвлениям |
| **API / auth / RLS** | [API.md](./API.md), [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md) | `fitness-diary-security.mdc`, `fitness-diary-supabase.mdc` | `verify-security-l1-audit` |
| **Деплой / прод** | [RELEASE.md](./RELEASE.md) | `fitness-diary-ship.mdc` | `lint` + релевантный qa |
| **Инцидент инфра** | [RUNBOOK.md](./RUNBOOK.md), INCIDENTS **P** / **Q** | `fitness-diary-hosting-portability.mdc` | По симптому |

**Коды жалоб (кратко):** зал A–H · админ I–L · продажи M–N · связь O · инфра P–Q — таблица в [INCIDENTS.md](./INCIDENTS.md) §2.

---

## 4. Правила Cursor — минимальный набор

| Задача | Обязательно |
|--------|-------------|
| Любой код | `fitness-diary-architecture.mdc`, `fitness-diary-ship.mdc` |
| Баг | `fitness-diary-stability.mdc`, `fitness-diary-fix-comprehensive.mdc` |
| Жалоба в чате | `fitness-diary-incidents.mdc` |
| Sync / офлайн | `fitness-diary-sync.mdc` |
| Статистика / абон | `fitness-diary-domain.mdc` |
| Новая фича | `fitness-diary-features.mdc`, `fitness-diary-file-structure.mdc` |
| Доки после смены поведения | `fitness-diary-docs.mdc` |
| Направление продукта | `fitness-diary-north-star-lead.mdc` |

Полный список — [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) §15.

---

## 5. Проверки перед «готово»

| Команда | Когда |
|---------|--------|
| `npm run lint` | **Всегда** |
| `npm run qa:critical` | Sync, черновик, complete, абон, главная, клиенты |
| `npm run qa:local` | Статистика, agg, продажи, широкий sync, build |
| `node scripts/verify-<тема>.mjs` | Точечно после правки одного правила |

Карта verify: [TESTING.md](./TESTING.md). Ручной планшет: [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md).

---

## 6. Куда класть код (шпаргалка)

| Что | Куда |
|-----|------|
| Бизнес-правила без React | `src/lib/*.js` |
| Админ: статистика, продажи | `src/lib/admin/` |
| API | `api/_lib/` + тонкий `api/*.js` |
| Новое action | `admin-data?action=` (≤12 functions) |
| UI | `pages/`, `components/` — тонко |
| Стили зоны | `src/styles/<zone>.css` |

Подробнее: handoff §3, `fitness-diary-file-structure.mdc`.

---

## 7. Обновление документации (DoD)

Сводная таблица — `fitness-diary-docs.mdc`. Кратко:

| Изменение | Файл |
|-----------|------|
| Жалоба / повтор | [INCIDENTS.md](./INCIDENTS.md) |
| Новая инструкция для зала | [RUNBOOK.md](./RUNBOOK.md) |
| Роли, маршруты, стек | [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) |
| API / sync / модель данных | [API.md](./API.md), [SYNC.md](./SYNC.md), [DATA_MODEL.md](./DATA_MODEL.md) |
| Verify / QA | [TESTING.md](./TESTING.md) |
| Заметный UX зала | [CHANGELOG.md](../CHANGELOG.md) |
| Новый doc | строка в [README.md](./README.md) |

---

## 8. Чего не делать

- Дублировать `.mdc` в `docs/` простынёй.
- Плодить INC без повтора симптома.
- Копировать историю кейсов в RUNBOOK.
- Читать весь репо «на всякий случай» — grep + узкий doc.
- Коммит / push / prod без явной просьбы владельца.
- Стартовать оплаты / cutover РФ без явной команды (PATH_TO_GOAL).

---

## 9. Ссылки-якоря

| Вопрос | Ответ |
|--------|--------|
| Карта всех docs | [README.md](./README.md) |
| Цель продукта | [PRODUCT_VISION.md](./PRODUCT_VISION.md) |
| Очередь работ | [PATH_TO_GOAL.md](./PATH_TO_GOAL.md) |
| Критический путь зала | [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) |
| История багов | [INCIDENTS.md](./INCIDENTS.md) |
| Симптом → файлы в репо | [CODE_TRACE.md](./CODE_TRACE.md) |
| Prod URL | https://fitness-diary-bice.vercel.app |
