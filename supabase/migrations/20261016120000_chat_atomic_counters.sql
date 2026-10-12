-- Переписка: счётчики «непрочитано» и «последнее сообщение» ведёт база, а не сервер «прочитал → +1 → записал»
-- (два быстрых сообщения считались за одно; встречная запись откатывала время диалога). docs/CHAT.md «Как устроено».
-- Плюс client_msg_id — номер сообщения от телефона: повтор отправки после обрыва связи не создаёт дубль.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS client_msg_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_msg_idx
  ON public.chat_messages (thread_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

ALTER TABLE public.staff_dm_messages ADD COLUMN IF NOT EXISTS client_msg_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS staff_dm_messages_client_msg_idx
  ON public.staff_dm_messages (thread_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

-- Превью — то же правило, что chatPreview в src/lib/chat/chatMessageCore.js (пробелы схлопнуть, 120 символов, «…»).
CREATE OR REPLACE FUNCTION public.chat_preview_text(body TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN char_length(p) > 120 THEN left(p, 119) || '…' ELSE p END
  FROM (SELECT btrim(regexp_replace(coalesce(body, ''), '\s+', ' ', 'g')) AS p) s
$$;

CREATE OR REPLACE FUNCTION public.chat_messages_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_threads t SET
    last_author = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN NEW.author_side ELSE t.last_author END,
    last_preview = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN public.chat_preview_text(NEW.body) ELSE t.last_preview END,
    last_message_at = GREATEST(coalesce(t.last_message_at, NEW.created_at), NEW.created_at),
    staff_unread = CASE WHEN NEW.author_side = 'client' THEN t.staff_unread + 1 ELSE 0 END,
    client_unread = CASE WHEN NEW.author_side = 'staff' THEN t.client_unread + 1 ELSE 0 END,
    staff_read_at = CASE WHEN NEW.author_side = 'staff' THEN GREATEST(coalesce(t.staff_read_at, NEW.created_at), NEW.created_at) ELSE t.staff_read_at END,
    client_read_at = CASE WHEN NEW.author_side = 'client' THEN GREATEST(coalesce(t.client_read_at, NEW.created_at), NEW.created_at) ELSE t.client_read_at END
  WHERE t.id = NEW.thread_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS chat_messages_after_insert ON public.chat_messages;
CREATE TRIGGER chat_messages_after_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_after_insert();

CREATE OR REPLACE FUNCTION public.staff_dm_messages_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  author_lo BOOLEAN;
BEGIN
  SELECT NEW.author_user_id = t.user_lo INTO author_lo FROM public.staff_dm_threads t WHERE t.id = NEW.thread_id;
  UPDATE public.staff_dm_threads t SET
    last_author = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN NEW.author_user_id ELSE t.last_author END,
    last_preview = CASE WHEN t.last_message_at IS NULL OR NEW.created_at >= t.last_message_at THEN public.chat_preview_text(NEW.body) ELSE t.last_preview END,
    last_message_at = GREATEST(coalesce(t.last_message_at, NEW.created_at), NEW.created_at),
    lo_unread = CASE WHEN author_lo THEN 0 ELSE t.lo_unread + 1 END,
    hi_unread = CASE WHEN author_lo THEN t.hi_unread + 1 ELSE 0 END,
    lo_read_at = CASE WHEN author_lo THEN GREATEST(coalesce(t.lo_read_at, NEW.created_at), NEW.created_at) ELSE t.lo_read_at END,
    hi_read_at = CASE WHEN author_lo THEN t.hi_read_at ELSE GREATEST(coalesce(t.hi_read_at, NEW.created_at), NEW.created_at) END
  WHERE t.id = NEW.thread_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS staff_dm_messages_after_insert ON public.staff_dm_messages;
CREATE TRIGGER staff_dm_messages_after_insert
  AFTER INSERT ON public.staff_dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.staff_dm_messages_after_insert();
