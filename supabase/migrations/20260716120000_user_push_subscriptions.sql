-- Push-подписки тренеров/сотрудников на задания Планёрки (Web Push, online-only).
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user
  ON public.user_push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_club
  ON public.user_push_subscriptions (club_id);

COMMENT ON TABLE public.user_push_subscriptions IS 'Web Push endpoints для уведомлений о заданиях Планёрки';
