# Коммерческий roadmap (FIT-CITY / fitness-diary)

Продукт **в эксплуатации**. Цель — масштаб и доверие к цифрам без «большого взрыва» в god-файлах.

## Принципы

1. **Офлайн-first** не ломаем: запись → IDB + очередь → push → pull; pull не затирает pending.
2. **Статистика:** период сводки ≠ годовой график (полный календарный год).
3. **Дубли агрегации:** `src/lib/admin/*Agg.js` ↔ `api/lib/*Agg.js` + `scripts/verify-*.mjs`.
4. **Vercel Hobby ≤12 functions** — расширять `admin-data?action=`, не плодить `api/*.js`.

---

## Фаза 0 — процесс и CI ✅

| Задача | Статус |
|--------|--------|
| `npm run qa:local` в GitHub Actions на PR/push | ✅ `.github/workflows/qa.yml` |
| `docs/RELEASE.md`, `docs/RUNBOOK.md` | ✅ |
| Удаление мёртвого UI «Не продлилось» | ✅ |
| Handoff обновлён | ✅ |

## Фаза 1 — прод-гигиена ✅

| Задача | Статус |
|--------|--------|
| `docs/SUPABASE_PROD_CHECKLIST.md` | ✅ |
| `docs/PAID_TIER_MIGRATION.md` | ✅ |
| Еженедельный prod smoke (workflow) | ✅ `qa-prod-weekly.yml` |
| Сборка/PWA в диагностике | ✅ `appBuildInfo.js`, DiagnosticsPanel |

## Фаза 2 — устойчивость кода (ongoing)

Делать **только при касании** файла, не отдельным релизом:

| Файл | ~строк | Направление |
|------|--------|-------------|
| `AppHeader.jsx` | ~700+ | вынести sync menu / diagnostics hook |
| `TrainingForm.jsx` | ~4k | подформы, хуки черновика |
| `syncService.js` | ~3.5k | flush / pull / save по модулям |
| `dataAccess.js` | ~3k | админ → `src/lib/admin/*` |
| `api/admin-data.js` | ~4k | action handlers → `api/lib/*` |

Правило: **strangler** — новый код в новом файле, старый импортирует.

## Фаза 3 — объём данных и паритет ✅ (док + verify)

| Задача | Статус |
|--------|--------|
| `docs/DATA_VOLUME.md` — SQL и пороги | ✅ |
| `verify-stats-agg-parity.mjs` (api vs src) | ✅ |
| Pull по периоду / партиционирование | ⏸ только при реальной нагрузке |

## Фаза 4 — после платного тарифа / крупного клиента

- Отдельные Edge Functions для тяжёлых админ-операций.
- Pull trainings/clients **по окну дат** (если IDB > лимита планшета).
- Расширенный мониторинг (Sentry/Logtail) — по согласованию.
- Консолидация дублей `*Agg.js` в один пакет, импортируемый и Vite, и Vercel (если сборка позволит без ломки путей).

---

## Мелкие UX (вне фаз, по приоритету)

| Проблема | Статус |
|----------|--------|
| В «Помощь» у тренера UUID вместо названия клуба | ✅ `resolveClubDisplayName` (кэш + Supabase) |
| Создание клуба / CONNECTION_RESET (§15 handoff) | открыто |

---

## Проверки перед релизом

```bash
npm run qa:local
```

При статистике дополнительно смотреть карточки и «Итог по клубу» на prod за май/июнь (см. RUNBOOK).

См. также: [RELEASE.md](./RELEASE.md), [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md).
