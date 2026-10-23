-- Текст застрявшей очереди с планшета: что не уходит, без тела записи.
ALTER TABLE public.device_health
  ADD COLUMN IF NOT EXISTS queue_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
