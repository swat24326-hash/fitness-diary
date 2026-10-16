-- Оценка клиентом после последней тренировки абонемента (и закладка под ДЗ/рацион).
-- Пишет сервер (push memberships / client-me). RLS без политик — как client_plans.

CREATE TABLE IF NOT EXISTS public.client_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('membership', 'homework', 'nutrition')),
  membership_id UUID REFERENCES public.memberships (id) ON DELETE CASCADE,
  score NUMERIC(2, 1),
  comment TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_ratings_score_chk CHECK (
    score IS NULL OR (score >= 1 AND score <= 5 AND (score * 2) = trunc(score * 2))
  ),
  CONSTRAINT client_ratings_membership_kind_chk CHECK (
    (kind = 'membership' AND membership_id IS NOT NULL)
    OR (kind <> 'membership')
  )
);

-- Один запрос оценки на абонемент.
CREATE UNIQUE INDEX IF NOT EXISTS client_ratings_membership_uidx
  ON public.client_ratings (membership_id)
  WHERE kind = 'membership' AND membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_ratings_client_idx
  ON public.client_ratings (client_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS client_ratings_notify_idx
  ON public.client_ratings (requested_at)
  WHERE notified_at IS NULL AND answered_at IS NULL AND dismissed_at IS NULL;

ALTER TABLE public.client_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_ratings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_ratings FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_ratings FROM authenticated';
  END IF;
END $$;
