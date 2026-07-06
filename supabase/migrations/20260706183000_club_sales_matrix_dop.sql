-- Доп. продажи в матрице дневного отчёта (НК/ДК/УК × шт и ₽ в matrix_amounts).
ALTER TABLE public.club_sales_daily
  ADD COLUMN IF NOT EXISTS dop_nk INTEGER NOT NULL DEFAULT 0 CHECK (dop_nk >= 0),
  ADD COLUMN IF NOT EXISTS dop_dk INTEGER NOT NULL DEFAULT 0 CHECK (dop_dk >= 0),
  ADD COLUMN IF NOT EXISTS dop_uk INTEGER NOT NULL DEFAULT 0 CHECK (dop_uk >= 0);
