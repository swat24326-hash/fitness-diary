-- «Входящие» сотрудников: рассылка тренерам / менеджерам продаж / управляющим.
-- Доставка — либо клиенту (client_id), либо сотруднику (user_id), ровно одно из двух.

ALTER TABLE public.inbox_campaigns DROP CONSTRAINT IF EXISTS inbox_campaigns_audience_check;
ALTER TABLE public.inbox_campaigns
  ADD CONSTRAINT inbox_campaigns_audience_check CHECK (audience IN ('clients', 'staff'));
ALTER TABLE public.inbox_campaigns ADD COLUMN IF NOT EXISTS staff_roles JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.inbox_deliveries ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.inbox_deliveries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users (id) ON DELETE CASCADE;
ALTER TABLE public.inbox_deliveries DROP CONSTRAINT IF EXISTS inbox_deliveries_one_recipient;
ALTER TABLE public.inbox_deliveries
  ADD CONSTRAINT inbox_deliveries_one_recipient CHECK ((client_id IS NULL) <> (user_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS inbox_deliveries_campaign_user_uidx
  ON public.inbox_deliveries (campaign_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_deliveries_user_idx
  ON public.inbox_deliveries (user_id, created_at DESC) WHERE user_id IS NOT NULL;
