-- Принятие оферты управляющим клуба (docs/PD_152FZ, offerCore.js).
-- Применять ДО деплоя кода, который читает колонки.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS offer_accepted_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS offer_version text;

COMMENT ON COLUMN public.users.offer_accepted_at IS
  'Когда управляющий принял текущую оферту Ядра в приложении.';
COMMENT ON COLUMN public.users.offer_version IS
  'Версия оферты (offerCore.OFFER_VERSION), которую принял пользователь.';
