ALTER TABLE public.club_sales_daily
  ADD COLUMN IF NOT EXISTS refunds_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (refunds_amount >= 0);
