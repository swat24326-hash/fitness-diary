-- Переписка сотрудник ↔ сотрудник внутри клуба: папки «Коллеги» и «Администрация» в «Сообщениях» (docs/CHAT.md).
-- Отдельно от chat_threads: там диалоги клиента, здесь — двух пользователей users.
-- Пишет и читает только сервер (service): /api/coach и admin-data?action=chat. Права — src/lib/chat/staffDmAccessCore.js.

CREATE TABLE IF NOT EXISTS public.staff_dm_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  -- Пара хранится упорядоченно (user_lo < user_hi): один диалог на двоих без дублей.
  user_lo UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  user_hi UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_author UUID,
  last_preview TEXT NOT NULL DEFAULT '',
  lo_read_at TIMESTAMPTZ,
  hi_read_at TIMESTAMPTZ,
  lo_unread INT NOT NULL DEFAULT 0 CHECK (lo_unread >= 0),
  hi_unread INT NOT NULL DEFAULT 0 CHECK (hi_unread >= 0),
  CHECK (user_lo < user_hi),
  UNIQUE (user_lo, user_hi)
);

CREATE INDEX IF NOT EXISTS staff_dm_threads_lo_idx
  ON public.staff_dm_threads (user_lo, last_message_at DESC);

CREATE INDEX IF NOT EXISTS staff_dm_threads_hi_idx
  ON public.staff_dm_threads (user_hi, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.staff_dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.staff_dm_threads (id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- id стикера из src/lib/chat/chatStickerCore.js; body = его подпись.
  sticker TEXT CHECK (sticker IS NULL OR sticker ~ '^[a-z0-9-]{1,32}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_dm_messages_thread_idx
  ON public.staff_dm_messages (thread_id, created_at DESC);

ALTER TABLE public.staff_dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_dm_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_dm_threads FROM PUBLIC;
REVOKE ALL ON public.staff_dm_messages FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.staff_dm_threads FROM anon';
    EXECUTE 'REVOKE ALL ON public.staff_dm_messages FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.staff_dm_threads FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.staff_dm_messages FROM authenticated';
  END IF;
END $$;
