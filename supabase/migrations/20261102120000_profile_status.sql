-- Смайлик рядом с именем, как эмодзи-статус в Telegram (docs/CHAT.md § «Статус рядом с именем»): каждый ставит себе сам
-- на срок; status_until null — пока не уберёт. Смайлик — только из набора src/lib/profile/profileStatusCore.js.
-- Применять ДО деплоя кода: списки переписки и «Мой профиль» читают эти колонки.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_emoji text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_until timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status_emoji text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status_until timestamptz;
