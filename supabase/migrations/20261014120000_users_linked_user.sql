-- Совмещённые роли: тренер и управляющий — один человек с двумя учётками (docs/CHAT.md «Совмещённые роли»).
-- Ссылка хранится в обеих строках; действует, только если взаимна, роли тренер + управляющий, один клуб, обе активны
-- (src/lib/chat/linkedStaffCore.js). Ставит только главный админ — admin-data?action=staff-link.
-- Читает и пишет только сервер (service role); RLS users не меняется.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_linked_user_idx
  ON public.users (linked_user_id)
  WHERE linked_user_id IS NOT NULL;
