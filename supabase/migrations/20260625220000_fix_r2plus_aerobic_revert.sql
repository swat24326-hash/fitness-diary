-- R2+ снова мог стать ПЗ после сохранения ставки в блоке тренеров (локальный кэш + push).
UPDATE public.membership_types
SET
  trainer_assignable = false,
  aerobic_pay_amount = GREATEST(COALESCE(trainer_pay_per_session, 0), COALESCE(aerobic_pay_amount, 0)),
  trainer_pay_per_session = 0
WHERE trainer_assignable IS NOT DISTINCT FROM true
  AND lower(trim(code)) = 'r2+';
