-- Мои Звонки: учётные данные на клуб (не только глобальный env).

ALTER TABLE public.club_iskra_settings
  ADD COLUMN IF NOT EXISTS moizvonki jsonb DEFAULT NULL;

COMMENT ON COLUMN public.club_iskra_settings.moizvonki IS
  'Мои Звонки клуба: { api_key, user_email, api_base }. Читать/писать только server service role; UI — маска без ключа.';
