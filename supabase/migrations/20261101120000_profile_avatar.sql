-- Фото профиля, как в Telegram (docs/CHAT.md § «Фото профиля»): каждый ставит себе сам — сотрудник в меню, клиент в /me/settings.
-- Файл — в бакете CHAT_VOICE_BUCKET под avatar/ (правило бакета удаляет только voice/), в строке — только ключ.
-- Применять ДО деплоя кода: списки переписки читают avatar_key.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_key text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS avatar_key text;
