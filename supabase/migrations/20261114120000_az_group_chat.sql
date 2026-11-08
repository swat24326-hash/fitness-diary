-- Группа АЗ: один общий чат инструктора со всеми подопечными из client_az_instructors
-- (docs/CHAT.md; план az_instructor_group_chat). Создавать вручную нельзя.
-- Участников не храним. Пишет/читает только сервис (как чат клуба).
-- Авторы смешанные: инструктор (user) и клиенты. «Прочитано» / mute — ключ u:<uuid> | c:<uuid>.

CREATE TABLE IF NOT EXISTS public.az_group_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id UUID NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_author_side TEXT CHECK (last_author_side IS NULL OR last_author_side IN ('user', 'client')),
  last_author_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  last_author_client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  last_preview TEXT NOT NULL DEFAULT '',
  pinned_message_id UUID,
  pinned_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS az_group_threads_club_idx ON public.az_group_threads (club_id);

CREATE TABLE IF NOT EXISTS public.az_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.az_group_threads (id) ON DELETE CASCADE,
  author_side TEXT NOT NULL CHECK (author_side IN ('user', 'client')),
  author_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  author_client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  sticker TEXT CHECK (sticker IS NULL OR sticker ~ '^[a-z0-9-]{1,32}$'),
  client_msg_id UUID,
  reply_to UUID REFERENCES public.az_group_messages (id) ON DELETE SET NULL,
  voice_key TEXT,
  voice_sec SMALLINT CHECK (voice_sec IS NULL OR voice_sec BETWEEN 1 AND 300),
  voice_wave SMALLINT[],
  voice_text TEXT,
  voice_stt_op TEXT,
  voice_played_at TIMESTAMPTZ,
  voice_once BOOLEAN NOT NULL DEFAULT false,
  attach_kind TEXT CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video', 'sticker')),
  attach_key TEXT,
  attach_mime TEXT,
  attach_bytes INT,
  attach_name TEXT,
  attach_w SMALLINT,
  attach_h SMALLINT,
  attach_caption TEXT,
  attach_sec SMALLINT CHECK (attach_sec IS NULL OR attach_sec BETWEEN 1 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT az_group_messages_author_chk CHECK (
    (author_side = 'user' AND author_user_id IS NOT NULL AND author_client_id IS NULL)
    OR (author_side = 'client' AND author_client_id IS NOT NULL AND author_user_id IS NULL)
  )
);

ALTER TABLE public.az_group_threads
  DROP CONSTRAINT IF EXISTS az_group_threads_pinned_message_id_fkey;
ALTER TABLE public.az_group_threads
  ADD CONSTRAINT az_group_threads_pinned_message_id_fkey
  FOREIGN KEY (pinned_message_id) REFERENCES public.az_group_messages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS az_group_messages_thread_idx
  ON public.az_group_messages (thread_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS az_group_messages_client_msg_idx
  ON public.az_group_messages (thread_id, client_msg_id) WHERE client_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS az_group_messages_reply_to_idx
  ON public.az_group_messages (reply_to) WHERE reply_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.az_group_reads (
  thread_id UUID NOT NULL REFERENCES public.az_group_threads (id) ON DELETE CASCADE,
  participant TEXT NOT NULL CHECK (participant ~ '^[uc]:[0-9a-f-]{36}$'),
  read_at TIMESTAMPTZ,
  muted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (thread_id, participant)
);

CREATE TABLE IF NOT EXISTS public.az_group_message_reactions (
  message_id UUID NOT NULL REFERENCES public.az_group_messages (id) ON DELETE CASCADE,
  reactor TEXT NOT NULL CHECK (reactor ~ '^[uc]:[0-9a-f-]{36}$'),
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reactor)
);

CREATE OR REPLACE FUNCTION public.az_group_messages_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  participant TEXT;
BEGIN
  UPDATE public.az_group_threads t SET
    last_author_side = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN NEW.author_side ELSE t.last_author_side END,
    last_author_user_id = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN NEW.author_user_id ELSE t.last_author_user_id END,
    last_author_client_id = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN NEW.author_client_id ELSE t.last_author_client_id END,
    last_preview = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN public.chat_preview_text(NEW.body) ELSE t.last_preview END,
    last_message_at = GREATEST(coalesce(t.last_message_at, NEW.created_at), NEW.created_at)
  WHERE t.id = NEW.thread_id;

  IF NEW.author_side = 'user' AND NEW.author_user_id IS NOT NULL THEN
    participant := 'u:' || NEW.author_user_id::text;
  ELSIF NEW.author_side = 'client' AND NEW.author_client_id IS NOT NULL THEN
    participant := 'c:' || NEW.author_client_id::text;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.az_group_reads (thread_id, participant, read_at)
  VALUES (NEW.thread_id, participant, NEW.created_at)
  ON CONFLICT (thread_id, participant) DO UPDATE
    SET read_at = GREATEST(coalesce(public.az_group_reads.read_at, EXCLUDED.read_at), EXCLUDED.read_at);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS az_group_messages_after_insert ON public.az_group_messages;
CREATE TRIGGER az_group_messages_after_insert
  AFTER INSERT ON public.az_group_messages
  FOR EACH ROW EXECUTE FUNCTION public.az_group_messages_after_insert();

ALTER TABLE public.az_group_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_group_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_group_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.az_group_threads FROM PUBLIC;
REVOKE ALL ON public.az_group_messages FROM PUBLIC;
REVOKE ALL ON public.az_group_reads FROM PUBLIC;
REVOKE ALL ON public.az_group_message_reactions FROM PUBLIC;
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['az_group_threads', 'az_group_messages', 'az_group_reads', 'az_group_message_reactions'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
