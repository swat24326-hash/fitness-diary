-- Доп. продажи в плане по направлениям (ПЗ + ТЗ + АЗ + plan_extra = финал).
ALTER TABLE public.club_sales_plan
  ADD COLUMN IF NOT EXISTS plan_extra NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_extra >= 0);
