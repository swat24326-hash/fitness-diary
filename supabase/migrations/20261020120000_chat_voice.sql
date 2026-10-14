-- Голосовые сообщения, как в Telegram (docs/CHAT.md): звук — MP3 в Object Storage (бакет CHAT_VOICE_BUCKET),
-- в базе ключ файла, длительность, волна для пузыря и расшифровка «→ Аа». body = «🎤 Голосовое 0:42» —
-- превью, push и поиск работают как раньше. Слушать можно сутки (проверяет сервер), файл удаляет правило бакета;
-- расшифровка остаётся навсегда.
-- Применять ДО деплоя кода: новый код читает колонки voice_*.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS voice_key TEXT,
  ADD COLUMN IF NOT EXISTS voice_sec SMALLINT,
  ADD COLUMN IF NOT EXISTS voice_wave SMALLINT[],
  ADD COLUMN IF NOT EXISTS voice_text TEXT,
  ADD COLUMN IF NOT EXISTS voice_stt_op TEXT;

ALTER TABLE public.staff_dm_messages
  ADD COLUMN IF NOT EXISTS voice_key TEXT,
  ADD COLUMN IF NOT EXISTS voice_sec SMALLINT,
  ADD COLUMN IF NOT EXISTS voice_wave SMALLINT[],
  ADD COLUMN IF NOT EXISTS voice_text TEXT,
  ADD COLUMN IF NOT EXISTS voice_stt_op TEXT;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_voice_sec_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_voice_sec_check CHECK (voice_sec IS NULL OR voice_sec BETWEEN 1 AND 300);

ALTER TABLE public.staff_dm_messages DROP CONSTRAINT IF EXISTS staff_dm_messages_voice_sec_check;
ALTER TABLE public.staff_dm_messages
  ADD CONSTRAINT staff_dm_messages_voice_sec_check CHECK (voice_sec IS NULL OR voice_sec BETWEEN 1 AND 300);
