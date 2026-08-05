# Уровень инженерии Оси (кратко)

**Актуально:** 2026-08-06. Не roadmap фич — оценка **как написан продукт**. Политика кода: `.cursor/rules/fitness-diary-architecture.mdc`, `fitness-diary-adult-app.mdc`.

## Где мы

| Шкала | Оценка |
|-------|--------|
| Слои (UI / lib / API / БД) | ✅ взрослые |
| Офлайн + Sync | ✅ ядро продукта |
| Auth / роли на сервере | ✅ |
| Verify на ветвлениях | ✅ (не всё покрыто) |
| Per-club настройки (Мои Звонки) | ✅; касса — ⏸ |
| Ширина домена как FitBase | 🟡 уже, не цель копировать всё |
| God-файлы | 🟡 режем при касании |

**Итог:** уровень прикладной разработки **выше** типичной «формы в 1С», **ниже** зрелой фитнес-платформы целиком. Цель — дожать свой контур (зал + CRM + правда оплат), не копировать FitBase.

## Не путать роли в коде и UI

| Структура | role | Маршрут |
|-----------|------|---------|
| Тренеры | `trainer` | `/trainer` |
| Менеджеры | `sales_manager` | `/sales` |
| Управляющие | `supervisor` | `/club` |

`list-trainers` без `role` = только тренеры. См. [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md), [DATA_MODEL.md](./DATA_MODEL.md).

## Что поднимает уровень дальше (без новых «витрин»)

1. **L3 оплаты** → потом касса на `club_id` — [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md).
2. При правке толстых экранов — вынос по `fitness-diary-split-files.mdc`.
3. Держать handoff / DATA_MODEL / API в синхроне с продом (`fitness-diary-docs.mdc`).

Карта продукта: [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md).
