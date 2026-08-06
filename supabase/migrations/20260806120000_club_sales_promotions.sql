-- Акции продаж: цели в плане месяца + факт шт в дневном отчёте.
-- Не входят в plan_matrix / уровни; старые строки без колонок читаются как [] / {}.

ALTER TABLE public.club_sales_plan
  ADD COLUMN IF NOT EXISTS promotions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.club_sales_plan.promotions IS
  'Акции месяца: [{id,name,start_date,end_date,segment_key,goal_qty,...}]; не суммируются в plan_matrix';

ALTER TABLE public.club_sales_daily
  ADD COLUMN IF NOT EXISTS promo_sales jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.club_sales_daily.promo_sales IS
  'Факт продаж по акциям за день: {promo_id: qty}. Часть факта сегмента, не замена матрицы';
