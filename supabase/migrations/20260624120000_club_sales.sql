CREATE TABLE IF NOT EXISTS public.club_sales_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  profit_nk NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (profit_nk >= 0),
  profit_dk NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (profit_dk >= 0),
  profit_uk NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (profit_uk >= 0),
  profit_day NUMERIC(14, 2) GENERATED ALWAYS AS (profit_nk + profit_dk + profit_uk) STORED,
  pnk_total INTEGER NOT NULL DEFAULT 0 CHECK (pnk_total >= 0),
  trainings_count INTEGER NOT NULL DEFAULT 0 CHECK (trainings_count >= 0),
  pz_nk INTEGER NOT NULL DEFAULT 0 CHECK (pz_nk >= 0),
  pz_dk INTEGER NOT NULL DEFAULT 0 CHECK (pz_dk >= 0),
  pz_uk INTEGER NOT NULL DEFAULT 0 CHECK (pz_uk >= 0),
  tz_nk INTEGER NOT NULL DEFAULT 0 CHECK (tz_nk >= 0),
  tz_dk INTEGER NOT NULL DEFAULT 0 CHECK (tz_dk >= 0),
  tz_uk INTEGER NOT NULL DEFAULT 0 CHECK (tz_uk >= 0),
  az_nk INTEGER NOT NULL DEFAULT 0 CHECK (az_nk >= 0),
  az_dk INTEGER NOT NULL DEFAULT 0 CHECK (az_dk >= 0),
  az_uk INTEGER NOT NULL DEFAULT 0 CHECK (az_uk >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT club_sales_daily_club_date UNIQUE (club_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_club_sales_daily_club_date
  ON public.club_sales_daily (club_id, report_date);

CREATE TABLE IF NOT EXISTS public.club_sales_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  plan_total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_total >= 0),
  plan_pz NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_pz >= 0),
  plan_tz NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_tz >= 0),
  plan_az NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_az >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_sales_plan_club_ym UNIQUE (club_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_club_sales_plan_club_ym
  ON public.club_sales_plan (club_id, year, month);

CREATE TABLE IF NOT EXISTS public.club_supervisor_expense (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_supervisor_expense_club_ym UNIQUE (club_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_club_supervisor_expense_club_ym
  ON public.club_supervisor_expense (club_id, year, month);
