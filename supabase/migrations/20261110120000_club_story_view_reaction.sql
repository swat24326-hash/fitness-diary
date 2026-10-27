-- Реакция зрителя на сторис клуба (как в Telegram: без лички).
-- Одна реакция на пару story + viewer; NULL — сняли.

ALTER TABLE public.club_story_views
  ADD COLUMN IF NOT EXISTS reaction TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_story_views_reaction_check'
  ) THEN
    ALTER TABLE public.club_story_views
      ADD CONSTRAINT club_story_views_reaction_check
      CHECK (
        reaction IS NULL
        OR reaction IN ('👍', '❤️', '🔥', '💪', '😂', '🙏')
      );
  END IF;
END $$;
