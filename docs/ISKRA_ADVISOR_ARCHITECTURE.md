# ИСКРА — архитектура бизнес-советника

Масштабируемая структура: аналитик-советник с ролевой адаптацией.

## Статус (2026)

| Роль советника | users.role (план) | Статус |
|----------------|-------------------|--------|
| **app_admin** | `admin` | **Активна** — полный доступ |
| **club_supervisor** | `supervisor` (управляющий) | Заложена, не включена |
| **curator** | `curator` (куратор) | Заложена, не включена |

Сейчас ИСКРА в UI только у **админа** и работает как **app_admin**: вся аналитика + бизнес-советы + подсказки по приложению.

## Три модели (целевые)

### Админ (`app_admin`) — сейчас
- Максимальные права: всё из куратора + техподдержка приложения
- План, прогноз, маржа, тренеры, «Что делать», sync, организация, деплой
- Snapshot **без** обрезки

### Управляющий (`club_supervisor`) — позже
- План, тренировки, тренеры, лёгкие советы
- Подсказки по работе в приложении (клиент, абонемент)
- Без детальной маржи и чистой прибыли

### Куратор (`curator`) — позже
- Полная аналитика клуба
- Стратегические бизнес-советы «как у сильного управленца»
- Без акцента на техподдержку приложения

## Слои кода

```
iskraAdvisorRoles.js      — реестр ролей (active: true/false)
iskraAdvisorScope.js      — app role → advisor role, filter snapshot
iskraBusinessAdvice.js    — карточки советов из insights
iskraAppGuide.js          — подсказки по FIT-CITY
iskraAdvisorPipeline.js   — оркестратор
```

## Включение управляющего / куратора (чеклист)

1. `users.role` + `AuthContext.normalizeRole`
2. `mapAppRoleToAdvisorRole()` — раскомментировать ветки
3. `ISKRA_ACTIVE_ADVISOR_ROLE_IDS` — добавить роль
4. Доступ к панели ИСКРЫ (сейчас `requireAdmin`)
5. `club_iskra_settings.quick_chips_by_role` (опционально)

## Verify

`node scripts/verify-iskra-advisor.mjs`

Самообучение: [ISKRA_SELF_LEARNING.md](./ISKRA_SELF_LEARNING.md), `node scripts/verify-iskra-learning.mjs`
