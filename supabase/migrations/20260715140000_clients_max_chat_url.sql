-- Ссылка на личный чат клиента в Max (max.ru/u/… или max.ru/@…)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS max_chat_url text;

COMMENT ON COLUMN public.clients.max_chat_url IS
  'Прямая ссылка на чат с клиентом в Max (из профиля клиента → QR → Поделиться). Без неё открывается экран «Поделиться».';
