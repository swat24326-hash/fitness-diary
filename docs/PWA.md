# PWA — установка и обновление на планшете

**Актуально:** 2026-08-21. Инциденты «белый экран / старая версия / цикл login»: [RUNBOOK.md §4](./RUNBOOK.md). Конфиг: `vite.config.js` (`vite-plugin-pwa`).

---

## Зачем

Тренер ставит FIT-CITY на планшет как приложение. Service worker кэширует оболочку; **данные клиентов** живут в IndexedDB + sync, не в SW-кэше API.

---

## Поведение сборки

| Режим | Service worker |
|-------|----------------|
| `npm run dev` | **выключен** (`devOptions.enabled` только при production mode) — иначе риск белого экрана из кэша |
| Production (Vercel) | включён; `registerType: 'prompt'` — обновление через UI, не silent-reload посреди работы |
| Workbox | кэш ассетов + navigate NetworkFirst; **Supabase REST/Auth в SW не кэшируются** (иначе «висит» при сбое сети) |
| Push | `importScripts: ['/push-sw.js']` — см. [PUSH_SETUP.md](./PUSH_SETUP.md) |

---

## Установка на планшет (кратко)

1. Открыть prod URL в Chrome / Edge на Android (или поддерживаемый браузер).
2. «Установить приложение» / «На экран Домой».
3. Вход под логином тренера; выбрать клуб при необходимости.
4. После установки хотя бы раз сделать **Sync** при хорошей сети.

Не удалять приложение с планшета без инструкции: можно потерять **несинхронизированную** очередь.

---

## Контур обновления (карта)

Один сценарий — несколько слоёв. Не чинить только баннер.

```
needRefresh / buildStale
        ↓
 decideAppUpdate (immediate | prompt | defer)
        ↓
 planPwaUpdateAction (+ authLoading, reload-guard)
        ↓
 applyPwaUpdate (пауза sync → SKIP_WAITING → controllerchange → reload)
        ↓
 mark in-flight → Auth держит splash, не /login
        ↓
 новая сборка → AppUpdatedBanner + сброс guard/in-flight
```

| Слой | Файл | Роль |
|------|------|------|
| Политика экрана | `appUpdatePolicy.js` | тренировка/черновик продаж → defer; login/home → immediate |
| План действия | `appUpdatePlanCore.js` | wait_auth / auto / manual_only / hard_recover |
| Анти-цикл reload | `appUpdateReloadGuard.js` | 90 с без повторного auto; 2-й тап → hard recover |
| In-flight | `appUpdateInFlightCore.js` | после reload не мигать login 120 с |
| Apply | `appUpdateApplyService.js` | SW + пауза sync + reload / `viteChunkReload` |
| UI | `PwaUpdatePrompt.jsx`, `AppUpdatedBanner.jsx` | баннер / «Приложение обновлено» |
| Auth | `AuthContext.jsx`, `Login.jsx`, `App.jsx` | splash «Обновляем…», дольше getSession |

### Как ведёт себя планшет

1. Есть новая версия → баннер (или auto на home/login, если политика immediate и auth готов).
2. На **тренировке** / свежем черновике **отчёта продаж** — только отложить.
3. **Слабый планшет:** если auto-reload сорвался (login↔главная), auto **не крутится** 90 с; кнопка **«Обновить ещё раз»** (повтор → сброс SW/кэша).
4. Во время смены SW — splash «Обновляем приложение…», не форма входа с «…».
5. Успех → «Приложение обновлено» + можно работать.

### Ошибка `Failed to fetch … PwaUpdatePrompt-….js` (или другой chunk)

Это **не Sync**: старая вкладка тянет удалённый chunk. Код: `viteChunkReload.js` (мягкий reload → hard recover). Связано с hard recover баннера обновления.

| Что делать | Зачем |
|------------|--------|
| Баннер **«Обновить ещё раз»** | сброс SW/кэша тем же контуром |
| **Помощь → Восстановить** | сессия + версия |
| Ctrl+F5 / закрыть PWA | если баннера нет |
| Не чистить очередь Sync | очередь тут ни при чём |

---

## Чеклист разработчика

- После prod-деплоя: PWA на планшете → обновление без цикла login; Диагностика — новый id сборки.
- Verify: `scripts/verify-app-stability.mjs` (политика + guard + plan + in-flight).
- Не включать SW в обычном `vite` dev без нужды.
- Иконки: `npm run gen:icons` → `public/icons/`.

Связано: [RELEASE.md](./RELEASE.md), [SYNC.md](./SYNC.md), [TESTING.md](./TESTING.md), [RUNBOOK.md](./RUNBOOK.md).
