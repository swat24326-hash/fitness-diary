-- Старые колонки, которые есть на prod Supabase, но пропали из цепочки миграций.
-- Клиент ещё читает их как запасные: bodyMeasures.js (arm/waist/…), salesReportCore.js (plan_nk/dk/uk).
-- Нужны Managed PG до переноса данных R3, иначе старые замеры и планы потеряются. На prod — no-op.
ALTER TABLE public.body_measurements
  ADD COLUMN IF NOT EXISTS arm NUMERIC,
  ADD COLUMN IF NOT EXISTS waist NUMERIC,
  ADD COLUMN IF NOT EXISTS hips NUMERIC,
  ADD COLUMN IF NOT EXISTS thigh NUMERIC,
  ADD COLUMN IF NOT EXISTS calf NUMERIC;

ALTER TABLE public.club_sales_plan
  ADD COLUMN IF NOT EXISTS plan_nk NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_dk NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_uk NUMERIC(14, 2) DEFAULT 0;
