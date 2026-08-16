-- Причина нахождения клиента в архиве (почему не в операционке).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archive_reason_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_archive_reason_len'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_archive_reason_len
      CHECK (archive_reason IS NULL OR char_length(archive_reason) <= 200);
  END IF;
END $$;

COMMENT ON COLUMN public.clients.archive_reason IS
  'Почему клиент в архиве; очищается при возврате в работу';
COMMENT ON COLUMN public.clients.archive_reason_at IS
  'Когда указали / обновили archive_reason';
