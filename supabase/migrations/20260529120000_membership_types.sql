-- Типы абонементов (справочник клуба) + ссылка из memberships.

CREATE TABLE IF NOT EXISTS public.membership_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT membership_types_code_len CHECK (char_length(trim(code)) >= 1 AND char_length(trim(code)) <= 12)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_types_club_code_lower
  ON public.membership_types (club_id, lower(trim(code)));

CREATE INDEX IF NOT EXISTS idx_membership_types_club_id
  ON public.membership_types (club_id);

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS membership_type_id UUID REFERENCES public.membership_types (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_membership_type_id
  ON public.memberships (membership_type_id)
  WHERE membership_type_id IS NOT NULL;
