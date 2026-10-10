-- Сообщения клиента в приложении: диалоги «Тренер», «Менеджер по продажам», «Управляющий».
-- Переписка принадлежит клубу: доступ сотрудника решает сервер по текущему тренеру и клубу клиента (docs/CHAT.md).
-- Пишет и читает только сервер (service): /api/client-me и admin-data?action=chat.

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('trainer', 'sales', 'supervisor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_author TEXT CHECK (last_author IN ('client', 'staff')),
  last_preview TEXT NOT NULL DEFAULT '',
  client_read_at TIMESTAMPTZ,
  staff_read_at TIMESTAMPTZ,
  client_unread INT NOT NULL DEFAULT 0 CHECK (client_unread >= 0),
  staff_unread INT NOT NULL DEFAULT 0 CHECK (staff_unread >= 0),
  UNIQUE (client_id, kind)
);

CREATE INDEX IF NOT EXISTS chat_threads_club_idx
  ON public.chat_threads (club_id, kind, last_message_at DESC);

CREATE INDEX IF NOT EXISTS chat_threads_recent_idx
  ON public.chat_threads (last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads (id) ON DELETE CASCADE,
  author_client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  author_side TEXT NOT NULL CHECK (author_side IN ('client', 'staff')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- id стикера из src/lib/chat/chatStickerCore.js; body = его подпись (push, превью, старые экраны).
  sticker TEXT CHECK (sticker IS NULL OR sticker ~ '^[a-z0-9-]{1,32}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_thread_idx
  ON public.chat_messages (thread_id, created_at DESC);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_threads FROM PUBLIC;
REVOKE ALL ON public.chat_messages FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.chat_threads FROM anon';
    EXECUTE 'REVOKE ALL ON public.chat_messages FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.chat_threads FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.chat_messages FROM authenticated';
  END IF;
END $$;
