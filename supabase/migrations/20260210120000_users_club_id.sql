-- Привязка тренера к клубу (админка: список по залу, переназначение).
-- После применения: тренер появляется в выбранном клубе; NULL — «без клуба».

DO $$
BEGIN
  ALTER TABLE public.users
    ADD COLUMN club_id uuid REFERENCES public.clubs (id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_club_id ON public.users (club_id) WHERE club_id IS NOT NULL;

COMMENT ON COLUMN public.users.club_id IS 'Основной клуб тренера (админка, журнал по умолчанию).';
