# ИСКРА — архитектура бизнес-советника

Ролевая адаптация и **расширенная роль куратора сети**.

## Статус (2026)

| Роль | users.role | Охват | Статус |
|------|------------|-------|--------|
| **app_admin** | `admin` | 1 клуб + техподдержка | **Активна** |
| **club_supervisor** | `supervisor` | 1 клуб, урезанная аналитика | Заложена |
| **curator** | `curator` | **Все клубы** + личное расширение | Заложена — [ISKRA_CURATOR.md](./ISKRA_CURATOR.md) |

## Куратор — не отдельный продукт

Куратор = **бизнес в приоритете** (продажи, KPI, аналитика по сети) **+** личный слой (привычки, здоровье, собеседник) в одном помощнике.

```
snapshot клубов (продажи, KPI)
        +
curator_context (привычки, здоровье, расписание)
        ↓
    один ответ Gemini
```

## Три роли

### Админ (`app_admin`) — сейчас
Один клуб: полная аналитика, Планёрка, KB приложения.

### Управляющий (`club_supervisor`) — позже
Один клуб: план, тренеры, без детальной маржи.

### Куратор (`curator`) — позже
Все клубы: продажи/KPI **в первую очередь**; личное — расширение. См. [ISKRA_CURATOR.md](./ISKRA_CURATOR.md).

## Слои кода

```
iskraAdvisorRoles.js
iskraPanelContourCore.js       — продажи | тренеры (внутри клуба)
iskraCuratorContourCore.js     — network_curator + личное расширение
iskraCuratorPersonaCore.js
```

## Verify

- `node scripts/verify-iskra-advisor.mjs`
- `node scripts/verify-iskra-curator-contour.mjs`
