-- Диалоги клиента с инструкторами АЗ: kind=az_instructor + peer_user_id (не clients.trainer_id).

ALTER TABLE public.chat_threads
  DROP CONSTRAINT IF EXISTS chat_threads_kind_check;

ALTER TABLE public.chat_threads
  ADD CONSTRAINT chat_threads_kind_check
  CHECK (kind IN ('trainer', 'sales', 'supervisor', 'az_instructor'));

ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS peer_user_id UUID REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.chat_threads
  DROP CONSTRAINT IF EXISTS chat_threads_client_id_kind_key;

ALTER TABLE public.chat_threads
  DROP CONSTRAINT IF EXISTS chat_threads_client_id_kind_uq;

DROP INDEX IF EXISTS public.chat_threads_client_id_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_client_kind_classic_uq
  ON public.chat_threads (client_id, kind)
  WHERE peer_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_client_kind_peer_uq
  ON public.chat_threads (client_id, kind, peer_user_id)
  WHERE peer_user_id IS NOT NULL;

ALTER TABLE public.chat_threads
  DROP CONSTRAINT IF EXISTS chat_threads_peer_kind_chk;

ALTER TABLE public.chat_threads
  ADD CONSTRAINT chat_threads_peer_kind_chk
  CHECK (
    (kind = 'az_instructor' AND peer_user_id IS NOT NULL)
    OR (kind <> 'az_instructor' AND peer_user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS chat_threads_peer_user_idx
  ON public.chat_threads (peer_user_id, last_message_at DESC)
  WHERE peer_user_id IS NOT NULL;

COMMENT ON COLUMN public.chat_threads.peer_user_id IS
  'Собеседник-сотрудник для kind=az_instructor (инструктор АЗ). Для trainer/sales/supervisor — NULL.';
