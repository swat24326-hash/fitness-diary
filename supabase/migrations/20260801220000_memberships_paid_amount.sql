-- Цена покупки абонемента (учёт ТЗ/АЗ desk и история на карточке).
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NULL;

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_paid_amount_nonneg;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_paid_amount_nonneg
  CHECK (paid_amount IS NULL OR paid_amount >= 0);

COMMENT ON COLUMN public.memberships.paid_amount IS
  'Сумма оплаты за этот абонемент (₽); для учёта на desk ТЗ/АЗ и истории покупок';
