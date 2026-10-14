-- Чат клуба: закреплённое сообщение сверху ленты, как в Telegram (docs/CHAT.md «Чат клуба»).
-- Одно на чат. Закрепляют управляющий клуба и главный админ (staffGroupPinCore.js), проверка — на сервере.
-- Удалили сообщение — закреп снимается сам. Применить до деплоя кода; без колонок полоса закрепа просто не появляется.

ALTER TABLE public.staff_group_threads
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES public.staff_group_messages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
