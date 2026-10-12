-- Реакции на сообщения, как в Telegram: долгое нажатие → 👍❤️🔥💪😂🙏 или любой смайлик набора, двойной тап → 👍 (docs/CHAT.md).
-- Одна реакция от человека на сообщение: другая — заменяет, та же — снимает.
-- reactor: 'c:<client_id>' — клиент, 'u:<user_id>' — сотрудник. Какие смайлики можно — src/lib/chat/chatReactionCore.js.
-- Применять ДО деплоя кода: новый код читает колонки last_reaction_* у диалогов.
-- Пишет и читает только сервер (service): /api/client-me, /api/coach, admin-data?action=chat.

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  message_id UUID NOT NULL REFERENCES public.chat_messages (id) ON DELETE CASCADE,
  reactor TEXT NOT NULL CHECK (reactor ~ '^[cu]:[0-9a-f-]{36}$'),
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reactor)
);

CREATE TABLE IF NOT EXISTS public.staff_dm_message_reactions (
  message_id UUID NOT NULL REFERENCES public.staff_dm_messages (id) ON DELETE CASCADE,
  reactor TEXT NOT NULL CHECK (reactor ~ '^u:[0-9a-f-]{36}$'),
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reactor)
);

-- Значок реакции в списке диалогов (как в Telegram): последняя реакция на сообщение собеседника,
-- пока он не открыл диалог. Снял реакцию — значок пропадает. Код: api/_lib/chat/chatReactionStore.js.
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS last_reaction_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reaction_emoji TEXT,
  ADD COLUMN IF NOT EXISTS last_reaction_by TEXT,
  ADD COLUMN IF NOT EXISTS client_reaction_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_reaction_seen_at TIMESTAMPTZ;

ALTER TABLE public.staff_dm_threads
  ADD COLUMN IF NOT EXISTS last_reaction_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reaction_emoji TEXT,
  ADD COLUMN IF NOT EXISTS last_reaction_by TEXT,
  ADD COLUMN IF NOT EXISTS lo_reaction_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hi_reaction_seen_at TIMESTAMPTZ;

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_dm_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_message_reactions FROM PUBLIC;
REVOKE ALL ON public.staff_dm_message_reactions FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.chat_message_reactions FROM anon';
    EXECUTE 'REVOKE ALL ON public.staff_dm_message_reactions FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.chat_message_reactions FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.staff_dm_message_reactions FROM authenticated';
  END IF;
END $$;
