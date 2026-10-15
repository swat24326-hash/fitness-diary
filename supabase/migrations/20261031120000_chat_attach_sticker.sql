-- Стикеры со своей клавиатуры (docs/CHAT.md): картинка с прозрачностью, вставленная в поле ввода, — вложение attach_kind = 'sticker'.
-- Файл PNG / WebP до 512 px — в том же бакете, но под chat-sticker/ (правило бакета удаляет только voice/): хранится навсегда.
-- body = «🖼 Стикер». Применять ДО деплоя кода: иначе запись стикера упрётся в CHECK.

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attach_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video', 'sticker'));

ALTER TABLE public.staff_dm_messages DROP CONSTRAINT IF EXISTS staff_dm_messages_attach_kind_check;
ALTER TABLE public.staff_dm_messages
  ADD CONSTRAINT staff_dm_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video', 'sticker'));

ALTER TABLE public.staff_group_messages DROP CONSTRAINT IF EXISTS staff_group_messages_attach_kind_check;
ALTER TABLE public.staff_group_messages
  ADD CONSTRAINT staff_group_messages_attach_kind_check CHECK (attach_kind IS NULL OR attach_kind IN ('photo', 'file', 'video', 'sticker'));
