-- Напоминания тренеру за 15 минут до записи Ежедневника (cron на ВМ: scripts/schedule-reminders-vm.mjs).

-- Выключатель на каждом устройстве: планшет и телефон тренера настраиваются отдельно. По умолчанию включено.
ALTER TABLE public.user_push_subscriptions
  ADD COLUMN IF NOT EXISTS schedule_reminders BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_push_subscriptions.schedule_reminders IS
  'Push-напоминание за 15 минут до записи Ежедневника на это устройство';

-- Журнал отправленного: одно напоминание на запись и её время; перенос записи — новое напоминание.
CREATE TABLE IF NOT EXISTS public.trainer_schedule_reminder_log (
  entry_id UUID NOT NULL REFERENCES public.trainer_schedule_entries (id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  start_minutes INT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, day_date, start_minutes)
);

CREATE INDEX IF NOT EXISTS trainer_schedule_reminder_log_day_idx
  ON public.trainer_schedule_reminder_log (day_date);

ALTER TABLE public.trainer_schedule_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trainer_schedule_reminder_log FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.trainer_schedule_reminder_log FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.trainer_schedule_reminder_log FROM authenticated';
  END IF;
END $$;
