-- «Ответить» с цитатой, как в Telegram (docs/CHAT.md): сообщение помнит, на какое отвечает.
-- Цитату (кто, первая строка) собирает сервер при чтении ленты — api/_lib/chat/chatReplyStore.js.
-- Исходное удалили — ответ остаётся, цитата пропадает (ON DELETE SET NULL).
-- Применять ДО деплоя кода: новый код читает колонку reply_to.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.chat_messages (id) ON DELETE SET NULL;

ALTER TABLE public.staff_dm_messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.staff_dm_messages (id) ON DELETE SET NULL;

-- Ночная очистка старых сообщений удаляет пачками: без индекса SET NULL сканировал бы всю таблицу на каждое.
CREATE INDEX IF NOT EXISTS chat_messages_reply_to_idx ON public.chat_messages (reply_to) WHERE reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_dm_messages_reply_to_idx ON public.staff_dm_messages (reply_to) WHERE reply_to IS NOT NULL;
