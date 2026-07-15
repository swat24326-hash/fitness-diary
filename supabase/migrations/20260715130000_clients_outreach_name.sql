-- Имя для обращения в Max (опционально). Список клиентов по-прежнему хранит Фамилия + И.О./Имя.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS outreach_name text;

COMMENT ON COLUMN public.clients.outreach_name IS
  'Как обращаться в сообщениях Max; если пусто — берём второе слово из name (полное имя), иначе без имени';
