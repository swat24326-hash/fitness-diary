-- Исход звонка из webhook Мои Звонки (call.finish): длительность, отвечен, id.

ALTER TABLE public.club_call_log
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS answered BOOLEAN,
  ADD COLUMN IF NOT EXISTS duration_sec INTEGER,
  ADD COLUMN IF NOT EXISTS mz_db_call_id TEXT,
  ADD COLUMN IF NOT EXISTS mz_pbx_call_id TEXT,
  ADD COLUMN IF NOT EXISTS src_number TEXT,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_call_log_outcome_check'
  ) THEN
    ALTER TABLE public.club_call_log
      ADD CONSTRAINT club_call_log_outcome_check
      CHECK (outcome IN ('pending', 'answered', 'missed', 'short', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_club_call_log_club_phone_created
  ON public.club_call_log (club_id, phone, created_at DESC);

COMMENT ON COLUMN public.club_call_log.outcome IS
  'pending = только команда API; answered|missed|short|unknown — после webhook call.finish';
