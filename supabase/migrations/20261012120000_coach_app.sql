-- Приложение тренера на телефоне (/coach): push-подписка помнит, из какого приложения она пришла,
-- чтобы тап по уведомлению открывал /coach/..., а не полное приложение зала.
-- Накатывать ДО выкатки кода: сервер читает и пишет колонку app во всех staff-push.
-- Телефон в user_devices / auth_sessions отличается номером устройства (coach-…), новых колонок там нет.

ALTER TABLE public.user_push_subscriptions
  ADD COLUMN IF NOT EXISTS app TEXT NOT NULL DEFAULT 'staff';

ALTER TABLE public.user_push_subscriptions
  DROP CONSTRAINT IF EXISTS user_push_subscriptions_app_values;

ALTER TABLE public.user_push_subscriptions
  ADD CONSTRAINT user_push_subscriptions_app_values CHECK (app IN ('staff', 'coach'));

COMMENT ON COLUMN public.user_push_subscriptions.app IS
  'staff — приложение зала (планшет / монитор); coach — приложение тренера на телефоне (/coach).';
