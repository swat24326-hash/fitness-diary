-- Планёрка: этапы внутри задания (чеклист исполнителя).

ALTER TABLE public.club_iskra_dispatch
  ADD COLUMN IF NOT EXISTS stages_json jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.club_iskra_dispatch.stages_json IS
  'Этапы задания: [{ id, title, done, done_at, order }]';
