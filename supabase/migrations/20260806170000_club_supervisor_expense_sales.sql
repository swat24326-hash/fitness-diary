-- Статья «Отдел продаж» в расходе управляющего.
ALTER TABLE public.club_supervisor_expense
  ADD COLUMN IF NOT EXISTS amount_sales NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (amount_sales >= 0);

COMMENT ON COLUMN public.club_supervisor_expense.amount_sales IS 'Отдел продаж';
