-- Быстрые кнопки ИСКРЫ на клуб (null = дефолт из кода).

ALTER TABLE public.club_iskra_settings
  ADD COLUMN IF NOT EXISTS quick_chips jsonb;

COMMENT ON COLUMN public.club_iskra_settings.quick_chips IS
  'Массив { id, label, message, compare?, handler_id? }; пусто/null — дефолтные кнопки приложения';
