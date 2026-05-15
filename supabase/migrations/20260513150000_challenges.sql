-- Челленджи клуба: идемпотентное добавление на существующую БД.

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  metric TEXT NOT NULL DEFAULT 'max_weight' CHECK (metric IN ('max_weight', 'max_reps', 'max_rpe')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT challenges_dates_ok CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_challenges_club_id ON challenges (club_id);
CREATE INDEX IF NOT EXISTS idx_challenges_exercise_id ON challenges (exercise_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges (status);
