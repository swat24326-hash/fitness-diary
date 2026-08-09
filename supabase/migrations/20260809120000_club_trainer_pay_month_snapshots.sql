-- Снимок правил ЗП клуба на календарный месяц (ставки / план / кабинеты).

CREATE TABLE IF NOT EXISTS public.club_trainer_pay_month_snapshots (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, year, month)
);

COMMENT ON TABLE public.club_trainer_pay_month_snapshots IS
  'Заморозка правил ЗП на прошлый календарный месяц: planConfig, profiles, membershipTypes (ставки).';
COMMENT ON COLUMN public.club_trainer_pay_month_snapshots.payload IS
  'jsonb: { planConfig, profiles[], membershipTypes[] }';

ALTER TABLE public.club_trainer_pay_month_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_trainer_pay_month_snapshots_admin ON public.club_trainer_pay_month_snapshots;
CREATE POLICY club_trainer_pay_month_snapshots_admin ON public.club_trainer_pay_month_snapshots
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
