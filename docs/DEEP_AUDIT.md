# Глубокий аудит — fitness-diary

Адаптация процесса поиска критических ошибок под offline-first PWA.

## Когда запускать

- Перед релизом (`docs/RELEASE.md`)
- После изменений в: `syncService`, `membershipTypes*`, `pushRecordCore`, `mutationAuth`, `pullReferenceData`, RLS/миграции
- Команда: `npm run qa:local` + ручной прогон по чеклисту ниже

## Scope (критические зоны)

| Зона | Файлы | Риск |
|------|--------|------|
| Sync / очередь | `syncService.js`, `syncLocalRecords.js`, `localDb.js` | потеря записей, затирание pending pull |
| Типы абонементов | `membershipTypesService.js`, `membershipTypesMergeCore.js`, `membershipTypePushPayload.js` | ПЗ/АЗ перепутаны, push без полей |
| Push API | `api/_lib/pushRecordCore.js`, `mutationAuth.js` | обход auth, неполный payload |
| Pull | `pullReferenceData.js`, `trainerPullService.js` | pull затирает локаль с pending |
| Продажи vs админ | `adminSalesLocalService.js` vs `AdminMembershipTypes.jsx` | два источника истины, рассинхрон UI |
| Auth | `AuthContext.jsx`, `authSignInService.js` | 401 → пустые списки |

## Чеклист сценариев (обязательно описать триггер)

1. **Новый тип АЗ offline** → insert в IDB + queue → открыть «Типы абон.» online → тип не должен исчезнуть до Sync.
2. **Stale cache ПЗ** → forceFromCloud → Бокс/R1+/R2+ в блоке АЗ, не в ПЗ.
3. **Push типа АЗ** → в Supabase `trainer_assignable=false`, `aerobic_pay_amount` заполнен.
4. **Pull тренера** → строки с pending в `sync_queue` не затираются (`shouldPreserveLocalRowOnPull`).
5. **Sales bundle** → типы из облака; структура после pull совпадает с продажами.

## Шкала достоверности

- Открывать fix / PR только если есть **конкретный сценарий** воспроизведения.
- Фикс — **минимальный diff** + `scripts/verify-*.mjs` для новой ветвистой логики.
- Не дублировать: см. `docs/MEMORIES.md`.

## Автопроверки

```bash
npm run lint
npm run qa:local
node scripts/verify-membership-types-merge.mjs
node scripts/verify-aerobic-payroll.mjs
node scripts/verify-sync-offline.mjs
```

## Вывод

- **Критических нет** — одна строка в отчёте.
- **Есть fix** — баг, первопричина, diff, verify; запись в `docs/MEMORIES.md` до merge PR.
