-- Запрет сотруднику выкладывать рекламу клуба (админ / управляющий).
-- Пишет и читает только сервер (service role), как club_stories.

CREATE TABLE IF NOT EXISTS public.club_story_publish_bans (
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  banned_by UUID NOT NULL,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS club_story_publish_bans_user_idx
  ON public.club_story_publish_bans (user_id);

ALTER TABLE public.club_story_publish_bans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.club_story_publish_bans FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.club_story_publish_bans FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.club_story_publish_bans FROM authenticated;
  END IF;
END $$;
