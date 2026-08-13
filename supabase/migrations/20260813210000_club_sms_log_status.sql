-- Журнал SMS: успех / ошибка (чтобы в приложении было видно, что не ушло).

ALTER TABLE public.club_sms_log
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';

ALTER TABLE public.club_sms_log
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.club_sms_log
  DROP CONSTRAINT IF EXISTS club_sms_log_status_check;

ALTER TABLE public.club_sms_log
  ADD CONSTRAINT club_sms_log_status_check CHECK (status IN ('ok', 'fail'));

ALTER TABLE public.club_sms_log
  DROP CONSTRAINT IF EXISTS club_sms_log_error_len;

ALTER TABLE public.club_sms_log
  ADD CONSTRAINT club_sms_log_error_len CHECK (
    error_message IS NULL OR char_length(error_message) <= 200
  );

COMMENT ON COLUMN public.club_sms_log.status IS
  'ok — SMS ушло через Мои Звонки; fail — попытка не удалась (видно в журнале).';

COMMENT ON COLUMN public.club_sms_log.error_message IS
  'Краткая причина при status=fail.';
