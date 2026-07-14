-- План по ячейкам матрицы (кол-во × средний чек) для сравнения с дневными отчётами.
ALTER TABLE public.club_sales_plan
  ADD COLUMN IF NOT EXISTS plan_matrix JSONB NOT NULL DEFAULT '{}';
