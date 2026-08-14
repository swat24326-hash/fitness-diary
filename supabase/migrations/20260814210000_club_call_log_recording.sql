-- URL записи разговора из webhook Мои Звонки (call.finish → event.recording).

ALTER TABLE public.club_call_log
  ADD COLUMN IF NOT EXISTS recording_url TEXT;

COMMENT ON COLUMN public.club_call_log.recording_url IS
  'Ссылка на запись из Мои Звонки (call.finish.recording); null если записи нет';
