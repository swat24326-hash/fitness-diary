# Push Планёрки — чеклист перед продом

Офлайн-тренировки **не зависят** от push. Без ключей задания работают через виджет и шапку.

## 1. Миграция Supabase

```bash
npm run db:migrate:iskra -- --linked
```

Проверяет в том числе таблицу `user_push_subscriptions`.

## 2. VAPID-ключи (Vercel)

```bash
npx web-push generate-vapid-keys
```

В **Vercel → Settings → Environment Variables** (Production):

| Переменная | Значение |
|------------|----------|
| `VAPID_PUBLIC_KEY` | public из команды выше |
| `VAPID_PRIVATE_KEY` | private (не в git, не VITE_) |
| `VAPID_SUBJECT` | `mailto:ваш@email.ru` |

Опционально для сборки фронта: `VITE_VAPID_PUBLIC_KEY` = тот же public.

После добавления — **Redeploy**.

## 3. Деплой кода

```bash
git push origin main
npx vercel --prod --yes
```

См. [RELEASE.md](./RELEASE.md).

## 4. Проверка на планшете

1. PWA на домашнем экране (iOS — обязательно для push).
2. Тренер → меню → **Помощь** → «Уведомления Планёрки» → **Включить**.
3. **Проверить** — тестовое уведомление.
4. Админ → Планёрка → поставить задание → push на планшет тренера.
5. Тап по уведомлению → открывается Планёрка (`?inbox=1`).

## 5. Если push не пришёл

- Нет VAPID на Vercel → задания всё равно в приложении.
- Не дали разрешение браузеру.
- iOS без «На экран Домой».
- Тренер не нажал «Включить» в профиле.
- Серый текст «Включены», красный при «Проверить» → рассинхрон браузер/сервер: **Переподключить**, затем снова **Проверить**.

## 6. Microsoft Edge (ошибка «push service error»)

1. **Windows:** Параметры → Система → Уведомления → **Microsoft Edge** — включено.
2. **Edge:** `edge://settings/content/notifications` — сайт `fitness-diary-bice.vercel.app` в «Разрешить».
3. Закройте **InPrivate** и корпоративный VPN (блокируют WNS).
4. Обновите страницу (Ctrl+F5) и нажмите **Включить** снова.
5. Если не помогло — проверьте VAPID в Vercel (`npx web-push generate-vapid-keys`, redeploy).
6. Временный обход: **Chrome** на том же ПК — push там обычно стабильнее.

## Файлы

| Слой | Путь |
|------|------|
| SW handler | `public/push-sw.js` |
| API | `admin-data?action=push-subscription` |
| Отправка | `api/_lib/webPushCore.js` (при create dispatch) |
| UI | `TrainerPushPrompt`, `TrainerPushSettings` |
| Verify | `scripts/verify-trainer-push.mjs` |
