-- Чат клуба: один общий чат сотрудников на клуб (docs/CHAT.md «Чат клуба»).
-- Участников не храним: состав — активные тренеры, менеджеры и управляющий клуба (staffGroupCore.js),
-- уволили / перевели — сразу вне чата. Главный админ читает и пишет в чаты всех клубов.
-- «Прочитано» и «без звука» — у каждого своё (staff_group_reads). Пишет и читает только сервер (service).
-- Применить до деплоя кода: без таблиц строка «Чат клуба» просто не показывается.

CREATE TABLE IF NOT EXISTS public.staff_group_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL UNIQUE REFERENCES public.clubs (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_author UUID,
  last_preview TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.staff_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.staff_group_threads (id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  sticker TEXT CHECK (sticker IS NULL OR sticker ~ '^[a-z0-9-]{1,32}$'),
  client_msg_id UUID,
  reply_to UUID REFERENCES public.staff_group_messages (id) ON DELETE SET NULL,
  voice_key TEXT,
  voice_sec SMALLINT CHECK (voice_sec IS NULL OR voice_sec BETWEEN 1 AND 300),
  voice_wave SMALLINT[],
  voice_text TEXT,
  voice_stt_op TEXT,
  voice_played_at TIMESTAMPTZ,
  voice_once BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_group_messages_thread_idx
  ON public.staff_group_messages (thread_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS staff_group_messages_client_msg_idx
  ON public.staff_group_messages (thread_id, client_msg_id) WHERE client_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_group_messages_reply_to_idx
  ON public.staff_group_messages (reply_to) WHERE reply_to IS NOT NULL;

-- read_at — время последнего показанного человеку сообщения: «непрочитано» = сообщения других позже него.
CREATE TABLE IF NOT EXISTS public.staff_group_reads (
  thread_id UUID NOT NULL REFERENCES public.staff_group_threads (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  muted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.staff_group_message_reactions (
  message_id UUID NOT NULL REFERENCES public.staff_group_messages (id) ON DELETE CASCADE,
  reactor TEXT NOT NULL CHECK (reactor ~ '^u:[0-9a-f-]{36}$'),
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reactor)
);

-- Последнее сообщение чата и «прочитано» автора ведёт база (как у личных диалогов): два быстрых сообщения не теряются.
CREATE OR REPLACE FUNCTION public.staff_group_messages_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.staff_group_threads t SET
    last_author = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN NEW.author_user_id ELSE t.last_author END,
    last_preview = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN public.chat_preview_text(NEW.body) ELSE t.last_preview END,
    last_message_at = GREATEST(coalesce(t.last_message_at, NEW.created_at), NEW.created_at)
  WHERE t.id = NEW.thread_id;
  IF NEW.author_user_id IS NOT NULL THEN
    INSERT INTO public.staff_group_reads (thread_id, user_id, read_at)
    VALUES (NEW.thread_id, NEW.author_user_id, NEW.created_at)
    ON CONFLICT (thread_id, user_id) DO UPDATE
      SET read_at = GREATEST(coalesce(public.staff_group_reads.read_at, EXCLUDED.read_at), EXCLUDED.read_at);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS staff_group_messages_after_insert ON public.staff_group_messages;
CREATE TRIGGER staff_group_messages_after_insert
  AFTER INSERT ON public.staff_group_messages
  FOR EACH ROW EXECUTE FUNCTION public.staff_group_messages_after_insert();

ALTER TABLE public.staff_group_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_group_threads FROM PUBLIC;
REVOKE ALL ON public.staff_group_messages FROM PUBLIC;
REVOKE ALL ON public.staff_group_reads FROM PUBLIC;
REVOKE ALL ON public.staff_group_message_reactions FROM PUBLIC;
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_group_threads', 'staff_group_messages', 'staff_group_reads', 'staff_group_message_reactions'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
