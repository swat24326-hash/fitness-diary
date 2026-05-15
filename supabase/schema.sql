-- =====================================================
-- ФИТНЕС ДНЕВНИК — опорная схема PostgreSQL (Supabase)
-- =====================================================
-- Назначение: «с нуля» поднять БД, совместимую с клиентом (см. src/, saveLocalWithSync).
-- Обновления на живой базе — через supabase/migrations/*.sql (идемпотентные DO $$ …).
-- Очередь синхронизации sync_queue живёт только в IndexedDB браузера, в Supabase не создаём.

-- ------------------------------------------------------------
-- Клубы
-- ------------------------------------------------------------
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Пользователи (admin / trainer), не путать с auth.users Supabase
-- ------------------------------------------------------------
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'trainer')),
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  club_id UUID REFERENCES clubs (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_club_id ON users (club_id) WHERE club_id IS NOT NULL;

-- ------------------------------------------------------------
-- Клиенты (карточка: ФИО, телефон, дата рождения, номер карты, привязка к тренеру и клубу)
-- ------------------------------------------------------------
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birth_date DATE,
  card_number TEXT,
  trainer_id UUID NOT NULL REFERENCES users (id),
  club_id UUID NOT NULL REFERENCES clubs (id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_trainer_id ON clients (trainer_id);
CREATE INDEX IF NOT EXISTS idx_clients_club_id ON clients (club_id);

-- ------------------------------------------------------------
-- Абонементы
-- ------------------------------------------------------------
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_trainings INTEGER NOT NULL,
  used_trainings INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'closed')),
  club_id UUID NOT NULL REFERENCES clubs (id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memberships_client_id ON memberships (client_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club_id ON memberships (club_id);

-- ------------------------------------------------------------
-- Справочник упражнений
-- ------------------------------------------------------------
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  muscle_group TEXT NOT NULL,
  primary_muscles TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Тренировки (payload в data JSONB — см. TrainingForm / TrainingPage)
-- ------------------------------------------------------------
CREATE TABLE trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES users (id),
  club_id UUID NOT NULL REFERENCES clubs (id),
  date DATE NOT NULL,
  type TEXT CHECK (type IN ('Силовая', 'Функциональная', 'Кардио', 'Смешанная')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('draft', 'completed')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_trainings_client_id ON trainings (client_id);
CREATE INDEX IF NOT EXISTS idx_trainings_trainer_id ON trainings (trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainings_club_id ON trainings (club_id);
CREATE INDEX IF NOT EXISTS idx_trainings_date ON trainings (date DESC);

-- ------------------------------------------------------------
-- Карта здоровья (одна запись на клиента; в IndexedDB ключ — client_id)
-- ------------------------------------------------------------
CREATE TABLE health_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  height_cm NUMERIC(6, 2),
  weight_kg NUMERIC(6, 2),
  goal TEXT,
  diseases TEXT,
  contraindications TEXT,
  medications TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT health_cards_client_id_key UNIQUE (client_id)
);

-- ------------------------------------------------------------
-- Обмеры тела (поля как в src/lib/bodyMeasures.js — BODY_MEASURE_FIELDS)
-- Старые имена (arm, waist, …) при необходимости читаются через getMeasureValue() в клиенте.
-- ------------------------------------------------------------
CREATE TABLE body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  neck NUMERIC(6, 1),
  chest NUMERIC(6, 1),
  arm_r NUMERIC(6, 1),
  arm_l NUMERIC(6, 1),
  waist_upper NUMERIC(6, 1),
  waist_lower NUMERIC(6, 1),
  glutes NUMERIC(6, 1),
  thigh_r NUMERIC(6, 1),
  thigh_l NUMERIC(6, 1),
  calf_r NUMERIC(6, 1),
  calf_l NUMERIC(6, 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_client_date ON body_measurements (client_id, date DESC);

-- ------------------------------------------------------------
-- Челленджи клуба (рейтинг считается на клиенте из trainings.data)
-- ------------------------------------------------------------
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  exercise_id UUID NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  metric TEXT NOT NULL DEFAULT 'max_weight' CHECK (metric IN ('max_weight', 'max_reps', 'max_time_sec', 'max_distance_m', 'max_rpe', 'max_points')),
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
