-- Баллы за опросы клиента: начисляются при ответе (inbox_deliveries.reward_granted_at), не сгорают,
-- обмениваются на стойке. Отдельно от копилки ПЗ (loyalty_ledger). Баланс = начислено − списано.

CREATE TABLE IF NOT EXISTS public.inbox_points_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  points INT NOT NULL CHECK (points > 0),
  comment TEXT NOT NULL DEFAULT '',
  actor_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_points_redemptions_client_idx
  ON public.inbox_points_redemptions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbox_deliveries_client_granted_idx
  ON public.inbox_deliveries (client_id) WHERE reward_granted_at IS NOT NULL;

ALTER TABLE public.inbox_points_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inbox_points_redemptions FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.inbox_points_redemptions FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.inbox_points_redemptions FROM authenticated';
  END IF;
END $$;
