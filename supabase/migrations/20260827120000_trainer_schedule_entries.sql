-- Ежедневник тренера: слоты расписания (персоналки, заметки).

CREATE TABLE IF NOT EXISTS public.trainer_schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  start_minutes INT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  title TEXT NOT NULL DEFAULT '',
  client_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_training_id UUID REFERENCES public.trainings (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_schedule_start_minutes CHECK (start_minutes >= 0 AND start_minutes < 1440),
  CONSTRAINT trainer_schedule_duration CHECK (duration_minutes >= 15 AND duration_minutes <= 480),
  CONSTRAINT trainer_schedule_title_len CHECK (char_length(trim(title)) <= 240)
);

CREATE INDEX IF NOT EXISTS idx_trainer_schedule_trainer_day
  ON public.trainer_schedule_entries (trainer_id, day_date);

CREATE INDEX IF NOT EXISTS idx_trainer_schedule_club_day
  ON public.trainer_schedule_entries (club_id, day_date);

COMMENT ON TABLE public.trainer_schedule_entries IS 'Расписание тренера: слот дня, заметка и/или клиенты; sync с планшета.';

ALTER TABLE public.trainer_schedule_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_trainer_schedule_admin_all ON public.trainer_schedule_entries;
DROP POLICY IF EXISTS fit_trainer_schedule_trainer_own ON public.trainer_schedule_entries;

CREATE POLICY fit_trainer_schedule_admin_all
  ON public.trainer_schedule_entries
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_trainer_schedule_trainer_own
  ON public.trainer_schedule_entries
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
    AND club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
    AND club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );
