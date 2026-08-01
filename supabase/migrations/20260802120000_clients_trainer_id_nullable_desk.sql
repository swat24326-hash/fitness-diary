-- Desk ТЗ/АЗ: клиент без тренера (trainer_id NULL), не служебный «Не назначен».
-- Обычный клиент по-прежнему обязан иметь trainer_id.

ALTER TABLE public.clients
  ALTER COLUMN trainer_id DROP NOT NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_trainer_or_desk_hall_chk;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_trainer_or_desk_hall_chk
  CHECK (
    trainer_id IS NOT NULL
    OR desk_hall IN ('tz', 'az')
  );

UPDATE public.clients
SET trainer_id = NULL
WHERE desk_hall IN ('tz', 'az')
  AND trainer_id IS NOT NULL;
