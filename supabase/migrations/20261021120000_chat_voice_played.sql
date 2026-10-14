-- «Прослушано» у голосовых, как в Telegram (docs/CHAT.md): синяя точка у непрослушанного гаснет у обоих,
-- когда собеседник автора впервые берёт звук. Ставит сервер (service role) при отдаче звука; RLS таблиц не меняется.
-- Применять ДО деплоя кода: новый код читает voice_played_at.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS voice_played_at TIMESTAMPTZ;
ALTER TABLE public.staff_dm_messages ADD COLUMN IF NOT EXISTS voice_played_at TIMESTAMPTZ;
