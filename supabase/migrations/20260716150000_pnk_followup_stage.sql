-- ПНК: этап уточнения после бесплатной тренировки

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_pnk_stage_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_pnk_stage_check
  CHECK (
    pnk_stage IS NULL
    OR pnk_stage IN ('new', 'assigned', 'contact', 'agreed', 'trial_done', 'followup', 'won', 'lost')
  );

COMMENT ON COLUMN public.clients.pnk_stage IS
  'Этап воронки ПНК: new → assigned → contact → agreed → trial_done → followup → won|lost';
COMMENT ON COLUMN public.clients.pnk_deliverables IS
  'Чеклист: contact, trial, nutrition, homework, followup — ISO-даты';
