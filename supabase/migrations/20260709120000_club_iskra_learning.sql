-- Сигналы самообучения ИСКРЫ на клуб (агрегаты по темам/чипам/подсказкам).

CREATE TABLE IF NOT EXISTS public.club_iskra_learning_signals (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  signal_key text NOT NULL,
  positive_count integer NOT NULL DEFAULT 0,
  negative_count integer NOT NULL DEFAULT 0,
  engagement_count integer NOT NULL DEFAULT 0,
  score numeric(8, 3) NOT NULL DEFAULT 0,
  playbook_note text NOT NULL DEFAULT '',
  playbook_confirmed boolean NOT NULL DEFAULT false,
  last_positive_at timestamptz,
  last_negative_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, signal_key)
);

CREATE INDEX IF NOT EXISTS club_iskra_learning_signals_score_idx
  ON public.club_iskra_learning_signals (club_id, score DESC);

COMMENT ON TABLE public.club_iskra_learning_signals IS
  'Агрегированные сигналы самообучения ИСКРЫ: 👍/👎, клики подсказок и чипов, playbooks клуба.';

ALTER TABLE public.club_iskra_learning_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_iskra_learning_signals_admin ON public.club_iskra_learning_signals;
CREATE POLICY club_iskra_learning_signals_admin ON public.club_iskra_learning_signals
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
