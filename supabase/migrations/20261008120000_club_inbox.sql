-- «Входящие» клиента: рассылки клуба (объявление или опрос) и доставка каждому получателю.
-- Создаёт и читает только сервер (service): admin-data?action=inbox и /api/client-me.
-- Баллы за опрос здесь только записаны (reward_points); начисление — отдельный этап, см. docs/INBOX.md.

CREATE TABLE IF NOT EXISTS public.inbox_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('notice', 'survey')),
  audience TEXT NOT NULL DEFAULT 'clients' CHECK (audience IN ('clients')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  reward_points INT NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  club_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  halls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  recipients_count INT NOT NULL DEFAULT 0,
  push_status TEXT
);

CREATE INDEX IF NOT EXISTS inbox_campaigns_created_idx
  ON public.inbox_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS public.inbox_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.inbox_campaigns (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  answers JSONB,
  reward_points INT NOT NULL DEFAULT 0,
  reward_granted_at TIMESTAMPTZ,
  UNIQUE (campaign_id, client_id)
);

CREATE INDEX IF NOT EXISTS inbox_deliveries_client_idx
  ON public.inbox_deliveries (client_id, created_at DESC);

ALTER TABLE public.inbox_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inbox_campaigns FROM PUBLIC;
REVOKE ALL ON public.inbox_deliveries FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.inbox_campaigns FROM anon';
    EXECUTE 'REVOKE ALL ON public.inbox_deliveries FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.inbox_campaigns FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.inbox_deliveries FROM authenticated';
  END IF;
END $$;
