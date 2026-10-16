-- Граница истории диалога «Тренер» для нового тренера (docs/CHAT.md).
-- При смене clients.trainer_id: stamp trainer_chat_since = now(), обнулить staff_unread у kind=trainer.
-- Применять ДО деплоя кода, который читает колонку и режет ленту.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS trainer_chat_since timestamptz;

COMMENT ON COLUMN public.clients.trainer_chat_since IS
  'С этой метки новый тренер видит диалог kind=trainer; админ — всю историю. Ставит триггер при смене trainer_id.';

CREATE OR REPLACE FUNCTION public.clients_stamp_trainer_chat_since()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trainer_id IS DISTINCT FROM OLD.trainer_id THEN
    NEW.trainer_chat_since := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_trainer_chat_since_before ON public.clients;
CREATE TRIGGER clients_trainer_chat_since_before
  BEFORE UPDATE OF trainer_id ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.clients_stamp_trainer_chat_since();

CREATE OR REPLACE FUNCTION public.clients_clear_trainer_chat_unread()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trainer_id IS DISTINCT FROM OLD.trainer_id THEN
    UPDATE public.chat_threads
    SET staff_unread = 0,
        staff_read_at = COALESCE(staff_read_at, now())
    WHERE client_id = NEW.id
      AND kind = 'trainer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_trainer_chat_unread_after ON public.clients;
CREATE TRIGGER clients_trainer_chat_unread_after
  AFTER UPDATE OF trainer_id ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.clients_clear_trainer_chat_unread();
