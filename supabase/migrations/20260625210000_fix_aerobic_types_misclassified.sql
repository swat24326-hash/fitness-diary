-- Типы, созданные через «Добавить тип АЗ» до фикса push: в облаке остались trainer_assignable=true.
-- Переносим ставку из trainer_pay_per_session в aerobic_pay_amount для известных кодов АЗ.
UPDATE public.membership_types
SET
  trainer_assignable = false,
  aerobic_pay_amount = GREATEST(COALESCE(trainer_pay_per_session, 0), COALESCE(aerobic_pay_amount, 0)),
  trainer_pay_per_session = 0
WHERE trainer_assignable IS NOT DISTINCT FROM true
  AND lower(trim(code)) IN ('бокс', 'r1+', 'r2+');
