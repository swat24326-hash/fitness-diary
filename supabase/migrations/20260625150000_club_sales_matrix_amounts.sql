ALTER TABLE public.club_sales_daily
ADD COLUMN IF NOT EXISTS matrix_amounts JSONB NOT NULL DEFAULT '{}'::jsonb;
