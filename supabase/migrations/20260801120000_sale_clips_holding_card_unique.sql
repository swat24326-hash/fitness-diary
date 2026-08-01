-- Клип-карта (заявка на абон) + holding-флаг + partial UNIQUE номера карты в клубе.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_system_placeholder BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_system_placeholder IS
  'Системный placeholder (напр. «Не назначен») — вне ЗП / внимания / KPI.';

UPDATE public.users
SET is_system_placeholder = true
WHERE lower(trim(coalesce(name, ''))) = 'не назначен'
  AND is_system_placeholder = false;

-- Partial unique: одна карта на клуб (пустые / NULL не участвуют).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_club_card_number_unique
  ON public.clients (club_id, lower(trim(card_number)))
  WHERE card_number IS NOT NULL AND trim(card_number) <> '';

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS clip_id UUID;

CREATE TABLE IF NOT EXISTS public.sale_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  membership_id UUID REFERENCES public.memberships (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'awaiting'
    CHECK (status IN ('awaiting', 'done', 'cancelled')),
  clip_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  client_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  card_number TEXT,
  birth_date DATE,
  membership_type_id UUID REFERENCES public.membership_types (id) ON DELETE SET NULL,
  membership_type_label TEXT,
  total_trainings INTEGER,
  start_date DATE,
  end_date DATE,
  note TEXT,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at TIMESTAMPTZ,
  CONSTRAINT sale_clips_name_len CHECK (char_length(trim(client_name)) <= 200),
  CONSTRAINT sale_clips_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_sale_clips_club_date
  ON public.sale_clips (club_id, clip_date DESC);

CREATE INDEX IF NOT EXISTS idx_sale_clips_trainer_status
  ON public.sale_clips (trainer_id, status)
  WHERE trainer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_clips_client
  ON public.sale_clips (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_clip_id
  ON public.memberships (clip_id)
  WHERE clip_id IS NOT NULL;

COMMENT ON TABLE public.sale_clips IS
  'Клип-карта: заявка менеджера на создание абонемента на планшете (подтверждено планшетом).';

ALTER TABLE public.sale_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_sale_clips_admin_all ON public.sale_clips;
DROP POLICY IF EXISTS fit_sale_clips_trainer_read ON public.sale_clips;
DROP POLICY IF EXISTS fit_sale_clips_trainer_update ON public.sale_clips;

CREATE POLICY fit_sale_clips_admin_all
  ON public.sale_clips
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_sale_clips_trainer_read
  ON public.sale_clips
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
  );

CREATE POLICY fit_sale_clips_trainer_update
  ON public.sale_clips
  FOR UPDATE
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
  );
