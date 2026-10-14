-- Одноразовые голосовые, как в Telegram (docs/CHAT.md): собеседник слушает один раз, потом звук недоступен никому.
-- Ставит и проверяет сервер (service role); после прослушивания voice_played_at + voice_key = NULL. RLS таблиц не меняется.
-- Применять ДО деплоя кода: новый код читает voice_once.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS voice_once BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.staff_dm_messages ADD COLUMN IF NOT EXISTS voice_once BOOLEAN NOT NULL DEFAULT false;
