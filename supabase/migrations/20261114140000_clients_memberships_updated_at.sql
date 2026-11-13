-- A2: watermark / delta для admin list-clients и list-memberships (docs/CAPACITY_PLAN.md).
-- Клиентский push по-прежнему не доверяет updated_at — колонку двигает только триггер.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.clients
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.clients
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.clients
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.fit_clients_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_touch_updated_at ON public.clients;
CREATE TRIGGER trg_clients_touch_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.fit_clients_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_clients_club_updated_at
  ON public.clients (club_id, updated_at DESC);

COMMENT ON COLUMN public.clients.updated_at IS
  'Ревизия для admin list-clients delta (updated_since); bump при UPDATE (trigger). Push с планшета поле не принимает.';

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.memberships
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.memberships
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.memberships
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.fit_memberships_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memberships_touch_updated_at ON public.memberships;
CREATE TRIGGER trg_memberships_touch_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.fit_memberships_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_memberships_club_updated_at
  ON public.memberships (club_id, updated_at DESC);

COMMENT ON COLUMN public.memberships.updated_at IS
  'Ревизия для admin list-memberships delta (updated_since); bump при UPDATE (trigger). Push с планшета поле не принимает.';
