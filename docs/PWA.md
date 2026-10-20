# PWA — установка и обновление на планшете

**Актуально:** 2026-10-20 (стартовый хаб `/` для гостя; splash: прозрачный `purpose: any` + чёрный `background_color`, maskable на домашний экран; boot-зум в `index.html` до React). Инциденты «белый экран / старая версия / цикл login»: [RUNBOOK.md §4](./RUNBOOK.md). Конфиг: `vite.config.js` (`vite-plugin-pwa`).

### Стартовый вход и манифесты

| Поверхность | `start_url` / маршрут | Кто |
|-------------|----------------------|-----|
| Зал / сотрудник (основной PWA) | `manifest.json` → `/` | `StartHubPage`: Сотрудник (логин на месте). Кнопка «Мобильное приложение» раскрывает Тренер→`/coach` и Клиент→`/me`. Запасной прямой вход — `/login`. |
| Клиент | `manifest-client.json` → `/me` | Не ставить клиентский ярлык на `/` — свой scope. |
| Тренер на телефоне | `manifest-coach.json` → `/coach` | То же: свой scope, не смешивать с хабом. |

Цепочка splash: `#yadro-boot-splash` → хаб или роль → после входа сотрудника `AppWelcomeSplash` (как раньше). Обновление PWA на `/` и `/login` — `immediate` (`appUpdatePolicy.js`).

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
2. Кнопка «Установить приложение» на экране входа или после входа — бургер → своё имя сверху («Мой профиль») → «Установить приложение» (появляется, когда Chrome готов). Нет кнопки — меню браузера ⋮ → «Установить приложение» / «Добавить на главный экран».
3. Вход под логином тренера; выбрать клуб при необходимости.
4. После установки хотя бы раз сделать **Sync** при хорошей сети.

**Как устроено окно установки (с 13.10.2026, INC-2026-10-13-08):** Chrome шлёт `beforeinstallprompt` один раз за загрузку и иногда раньше, чем догрузится экран, — его ловит `src/lib/pwa/installPromptStore.js` при старте (`main.jsx`), экраны читают через `src/hooks/useInstallPrompt.js`: экран входа и «Настройки» планшета (`HeaderInstallItem.jsx`), `/me` (`useClientInstall.js`), `/coach` (`CoachInstallBanner.jsx`). Яндекс Браузер и Samsung Internet окна не дают — на Android телефоне подсказка показывает шаги через меню (`clientInstallMode` → `android`, `src/components/install/InstallSteps.jsx`). iPhone — только вручную «Поделиться» → «На экран „Домой“».

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
| Политика экрана | `appUpdatePolicy.js` | экран тренировки (`/trainer|admin|club/workouts/`), открытый черновик или свежий durable → defer; отчёт продаж → defer; login/home без черновика → immediate |
| План действия | `appUpdatePlanCore.js` | wait_auth / auto / manual_only / hard_recover |
| Анти-цикл reload | `appUpdateReloadGuard.js` | 90 с без повторного auto; 2-й тап → hard recover |
| In-flight | `appUpdateInFlightCore.js` | после reload не мигать login 120 с |
| Apply | `appUpdateApplyService.js` | flush черновиков → `registration.update` + ожидание waiting (до 20 с) → SKIP_WAITING → controllerchange → reload / `viteChunkReload`. Если контроллер не сменился, а на сервере новее → `hardResetAppShell` (кэш + SW, IndexedDB цела) уже с первой попытки — `shouldHardResetAfterUpdateAttempt` (INC-2026-10-14-01, INC-2026-10-16-02) |
| Черновик тренировки | `trainingDraftDurableStorage.js`, `trainingDraftUpdateFlush.js`, `trainingDraftDurableHydrate.js`, `trainingDraftCleanup.js` | localStorage + flush перед reload; после обновления — восстановление в IDB / вкладки; **удаление draft** снимает durable (иначе hydrate воскрешает). См. [SYNC.md](./SYNC.md) §3c |
| UI | `PwaUpdatePrompt.jsx`, `AppUpdatedBanner.jsx` | баннер / «Приложение обновлено» |
| Auth | `AuthContext.jsx`, `Login.jsx`, `App.jsx` | splash «Обновляем…», дольше getSession |

### Как ведёт себя планшет

1. Есть новая версия → баннер (или auto на home/login, если политика immediate и auth готов).
2. На **тренировке**, при **свежем черновике тренировки** (в т.ч. ушли с формы, но durable ещё есть) или свежем черновике **отчёта продаж** — auto не крутим. Баннер всё равно даёт **«Обновить сейчас»** (черновик пишется на диск перед reload). После **Удалить** черновик durable очищается — PWA-hydrate не должен снова создать строку (pending delete / tombstone).
3. **Слабый планшет:** если auto-reload сорвался (login↔главная), auto **не крутится** 90 с; кнопка **«Обновить ещё раз»** (повтор → сброс SW/кэша). Текст «прервалось» — только после реальной неудачи, не во время первой попытки.
4. Если SW не сменил контроллер, а на сервере уже новая сборка — **сброс оболочки** (`hardResetAppShell`) уже с первой попытки (и auto, и ручное), без обязательного второго тапа. Перед apply ждём `waiting` SW (до 20 с), если баннер пришёл только от сверки `index.html`.
5. Во время смены SW — splash «Обновляем приложение…», не форма входа с «…».
6. Успех → «Приложение обновлено» + можно работать.

### Ошибка `Failed to fetch … PwaUpdatePrompt-….js` / `reading 'ChatAttachBubble'` (или другой chunk)

Это **не Sync**: старая вкладка тянет удалённый chunk (иногда — `Cannot read properties of undefined (reading 'ИмяКомпонента')` у ленивого куска). Код: `viteChunkReload.js` (мягкий reload → hard recover). Связано с hard recover баннера обновления.

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
