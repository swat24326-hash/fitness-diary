-- Вложения в переписке (docs/CHAT.md): фото и PDF. Файл — в том же бакете, что звук голосовых (CHAT_VOICE_BUCKET,
-- префикс voice/att/ — правило бакета удаляет его через сутки), в базе ключ, тип, размер, имя и подпись.
-- body = «📷 Фото» / «📷 <подпись>» / «📎 <имя файла>» — превью, push, поиск и цитата работают как раньше.
-- Отдаёт файл сервер и только сутки с отправки. Применять ДО деплоя кода: новый код читает колонки attach_*.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attach_kind TEXT,
  ADD COLUMN IF NOT EXISTS attach_key TEXT,
  ADD COLUMN IF NOT EXISTS attach_mime TEXT,
  ADD COLUMN IF NOT EXISTS attach_bytes INT,
  ADD COLUMN IF NOT EXISTS attach_name TEXT,
  ADD COLUMN IF NOT EXISTS attach_w SMALLINT,
  ADD COLUMN IF NOT EXISTS attach_h SMALLINT,
  ADD COLUMN IF NOT EXISTS attach_caption TEXT;

ALTER TABLE public.staff_dm_messages
  ADD COLUMN IF NOT EXISTS attach_kind TEXT,
  ADD COLUMN IF NOT EXISTS attach_key TEXT,
  ADD COLUMN IF NOT EXISTS attach_mime TEXT,
  ADD COLUMN IF NOT EXISTS attach_bytes INT,
  ADD COLUMN IF NOT EXISTS attach_name TEXT,
  ADD COLUMN IF NOT EXISTS attach_w SMALLINT,
  ADD COLUMN IF NOT EXISTS attach_h SMALLINT,
  ADD COLUMN IF NOT EXISTS attach_caption TEXT;

ALTER TABLE public.staff_group_messages
  ADD COLUMN IF NOT EXISTS attach_kind TEXT,
  ADD COLUMN IF NOT EXISTS attach_key TEXT,
  ADD COLUMN IF NOT EXISTS attach_mime TEXT,
  ADD COLUMN IF NOT EXISTS attach_bytes INT,
  ADD COLUMN IF NOT EXISTS attach_name TEXT,
  ADD COLUMN IF NOT EXISTS attach_w SMALLINT,
  ADD COLUMN IF NOT EXISTS attach_h SMALLINT,
  ADD COLUMN IF NOT EXISTS attach_caption TEXT;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attach_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file'));

ALTER TABLE public.staff_dm_messages DROP CONSTRAINT IF EXISTS staff_dm_messages_attach_kind_check;
ALTER TABLE public.staff_dm_messages
  ADD CONSTRAINT staff_dm_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file'));

ALTER TABLE public.staff_group_messages DROP CONSTRAINT IF EXISTS staff_group_messages_attach_kind_check;
ALTER TABLE public.staff_group_messages
  ADD CONSTRAINT staff_group_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file'));
