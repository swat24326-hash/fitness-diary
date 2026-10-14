-- Видеокружки в переписке (docs/CHAT.md): вложение attach_kind = 'video', длительность — attach_sec (1–60 с).
-- Файл MP4 / WebM — в том же бакете под voice/att/ (правило бакета удаляет через сутки), как фото и PDF.
-- body = «📹 Видеосообщение 0:12». Применять ДО деплоя кода: новый код читает attach_sec.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attach_sec SMALLINT;
ALTER TABLE public.staff_dm_messages ADD COLUMN IF NOT EXISTS attach_sec SMALLINT;
ALTER TABLE public.staff_group_messages ADD COLUMN IF NOT EXISTS attach_sec SMALLINT;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attach_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video'));

ALTER TABLE public.staff_dm_messages DROP CONSTRAINT IF EXISTS staff_dm_messages_attach_kind_check;
ALTER TABLE public.staff_dm_messages
  ADD CONSTRAINT staff_dm_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video'));

ALTER TABLE public.staff_group_messages DROP CONSTRAINT IF EXISTS staff_group_messages_attach_kind_check;
ALTER TABLE public.staff_group_messages
  ADD CONSTRAINT staff_group_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video'));
