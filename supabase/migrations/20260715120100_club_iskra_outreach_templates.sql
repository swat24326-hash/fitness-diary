-- Шаблоны сообщений тренера в Max (на клуб).

ALTER TABLE public.club_iskra_settings
  ADD COLUMN IF NOT EXISTS outreach_templates jsonb DEFAULT NULL;

COMMENT ON COLUMN public.club_iskra_settings.outreach_templates IS
  'Шаблоны outreach в Max: birthdays, expiring, expired_recent, stale — плейсхолдеры {client_name}, {trainer_name}, {club_name}, …';
