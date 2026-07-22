-- Шаблоны клубного SMS (Мои Звонки) — отдельно от Max тренера.

ALTER TABLE public.club_iskra_settings
  ADD COLUMN IF NOT EXISTS club_sms_templates jsonb DEFAULT NULL;

COMMENT ON COLUMN public.club_iskra_settings.club_sms_templates IS
  'Шаблоны SMS клуба (Мои Звонки): birthdays, expiring, expired_recent, stale — от имени клуба, не «это твой тренер»';
