-- Тренер с планшетом / без: lite-ПЗ клиенты ведутся админом.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS uses_tablet BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.uses_tablet IS
  'true = полный дневник на планшете; false = lite ПЗ (карта/абон/оплата), ведёт админ';
