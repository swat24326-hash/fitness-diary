-- ИСКРА Dispatch v2: дедлайн, тип задания, статусы как в task-менеджере.

ALTER TABLE public.club_iskra_dispatch
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS deep_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_reply text NOT NULL DEFAULT '';

ALTER TABLE public.club_iskra_dispatch
  DROP CONSTRAINT IF EXISTS club_iskra_dispatch_status_check;

ALTER TABLE public.club_iskra_dispatch
  ADD CONSTRAINT club_iskra_dispatch_status_check
  CHECK (status IN ('pending', 'seen', 'accepted', 'done', 'dismissed', 'declined'));

ALTER TABLE public.club_iskra_dispatch
  DROP CONSTRAINT IF EXISTS club_iskra_dispatch_task_kind_check;

ALTER TABLE public.club_iskra_dispatch
  ADD CONSTRAINT club_iskra_dispatch_task_kind_check
  CHECK (task_kind IN ('reactivate_clients', 'daily_report', 'plan_push', 'training_hygiene', 'custom'));

ALTER TABLE public.club_iskra_dispatch
  DROP CONSTRAINT IF EXISTS club_iskra_dispatch_priority_check;

ALTER TABLE public.club_iskra_dispatch
  ADD CONSTRAINT club_iskra_dispatch_priority_check
  CHECK (priority IN ('normal', 'high'));

CREATE INDEX IF NOT EXISTS club_iskra_dispatch_due_idx
  ON public.club_iskra_dispatch (recipient_user_id, due_at)
  WHERE status IN ('pending', 'seen', 'accepted');

COMMENT ON COLUMN public.club_iskra_dispatch.task_kind IS 'Тип задания: reactivate_clients, daily_report, plan_push, training_hygiene, custom';
COMMENT ON COLUMN public.club_iskra_dispatch.due_at IS 'Дедлайн задания';
COMMENT ON COLUMN public.club_iskra_dispatch.deep_link IS 'Куда вести исполнителя в приложении';
