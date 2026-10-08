-- Автоопрос во «Входящие»: опрос с триггером приходит клиенту сам (сейчас — после 10-й тренировки),
-- пока его не закроют. NULL — обычная рассылка «сейчас».

ALTER TABLE public.inbox_campaigns
  ADD COLUMN IF NOT EXISTS trigger TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_campaigns_trigger_check') THEN
    ALTER TABLE public.inbox_campaigns
      ADD CONSTRAINT inbox_campaigns_trigger_check
      CHECK (trigger IS NULL OR (trigger IN ('trainings_10') AND kind = 'survey' AND audience = 'clients'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inbox_campaigns_open_trigger_idx
  ON public.inbox_campaigns (trigger) WHERE trigger IS NOT NULL AND closed_at IS NULL;

-- Подсчёт завершённых тренировок клиента по датам — для рубежа автоопроса.
CREATE INDEX IF NOT EXISTS idx_trainings_client_completed_date
  ON public.trainings (client_id, date) WHERE status = 'completed';
