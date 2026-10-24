-- Реклама клуба в сторис. Пишет и читает только сервер (service role).
-- Файл лежит в бакете, папка story/ (не voice/: то правило стирает через сутки).

CREATE TABLE IF NOT EXISTS public.club_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('news', 'promo')),
  cta TEXT NOT NULL DEFAULT 'none' CHECK (cta IN ('none', 'chat', 'membership')),
  expires_at TIMESTAMPTZ NOT NULL,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_stories_live_idx
  ON public.club_stories (club_id, created_at DESC)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.club_story_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.club_stories (id) ON DELETE CASCADE,
  pos INT NOT NULL CHECK (pos >= 0 AND pos < 5),
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INT NOT NULL,
  w INT,
  h INT,
  caption TEXT NOT NULL DEFAULT '',
  UNIQUE (story_id, pos)
);

CREATE TABLE IF NOT EXISTS public.club_story_views (
  story_id UUID NOT NULL REFERENCES public.club_stories (id) ON DELETE CASCADE,
  user_key TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_key)
);

ALTER TABLE public.club_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_story_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_story_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.club_stories FROM PUBLIC;
REVOKE ALL ON public.club_story_frames FROM PUBLIC;
REVOKE ALL ON public.club_story_views FROM PUBLIC;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['club_stories', 'club_story_frames', 'club_story_views']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
