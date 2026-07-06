ALTER TABLE public.club_sales_daily
ADD COLUMN IF NOT EXISTS aerobic_sales_matrix JSONB NOT NULL DEFAULT '[]'::jsonb;
