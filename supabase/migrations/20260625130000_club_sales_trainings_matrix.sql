ALTER TABLE public.club_sales_daily
ADD COLUMN IF NOT EXISTS trainings_matrix JSONB NOT NULL DEFAULT '[]'::jsonb;
