-- Разбивка расхода управляющего по статьям (итого по-прежнему amount).
-- Идемпотентно.

ALTER TABLE public.club_supervisor_expense
  ADD COLUMN IF NOT EXISTS amount_rent NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (amount_rent >= 0);

ALTER TABLE public.club_supervisor_expense
  ADD COLUMN IF NOT EXISTS amount_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (amount_expenses >= 0);

ALTER TABLE public.club_supervisor_expense
  ADD COLUMN IF NOT EXISTS amount_deposits NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (amount_deposits >= 0);

ALTER TABLE public.club_supervisor_expense
  ADD COLUMN IF NOT EXISTS amount_accounting NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (amount_accounting >= 0);

COMMENT ON COLUMN public.club_supervisor_expense.amount IS
  'Итого расхода за месяц (сумма статей); для чистой прибыли';
COMMENT ON COLUMN public.club_supervisor_expense.amount_rent IS 'Аренда';
COMMENT ON COLUMN public.club_supervisor_expense.amount_expenses IS 'Расходы (операционные)';
COMMENT ON COLUMN public.club_supervisor_expense.amount_deposits IS 'Оклады';
COMMENT ON COLUMN public.club_supervisor_expense.amount_accounting IS 'Бухгалтерия';
