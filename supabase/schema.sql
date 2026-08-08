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
  uses_tablet BOOLEAN NOT NULL DEFAULT true,
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
  outreach_name TEXT,
  max_chat_url TEXT,
  trainer_id UUID REFERENCES users (id),
  club_id UUID NOT NULL REFERENCES clubs (id),
  archived_at TIMESTAMPTZ,
  lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'pnk', 'pnk_lost')),
  pnk_stage TEXT CHECK (
    pnk_stage IS NULL
    OR pnk_stage IN ('new', 'assigned', 'contact', 'agreed', 'trial_done', 'won', 'lost')
  ),
  pnk_source TEXT,
  pnk_trial_date DATE,
  pnk_trial_time TEXT,
  pnk_comment TEXT,
  pnk_comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  pnk_deliverables JSONB NOT NULL DEFAULT '{}'::jsonb,
  pnk_won_at TIMESTAMPTZ,
  pnk_lost_at TIMESTAMPTZ,
  pnk_lost_reason TEXT,
  pnk_created_at TIMESTAMPTZ,
  desk_hall TEXT CHECK (desk_hall IS NULL OR desk_hall IN ('tz', 'az')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT clients_trainer_or_desk_hall_chk CHECK (
    trainer_id IS NOT NULL
    OR desk_hall IN ('tz', 'az')
  )
);

CREATE INDEX IF NOT EXISTS idx_clients_trainer_id ON clients (trainer_id);
CREATE INDEX IF NOT EXISTS idx_clients_club_id ON clients (club_id);
CREATE INDEX IF NOT EXISTS idx_clients_club_archived_at ON clients (club_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_clients_club_desk_hall ON clients (club_id, desk_hall)
  WHERE desk_hall IS NOT NULL;

-- ------------------------------------------------------------
-- Типы абонементов (справочник клуба)
-- ------------------------------------------------------------
CREATE TABLE membership_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trainer_pay_per_session NUMERIC(10, 2) NOT NULL DEFAULT 0,
  trainer_pay_l1 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  trainer_pay_l2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  trainer_pay_l3 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  trainer_assignable BOOLEAN NOT NULL DEFAULT true,
  aerobic_pay_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_pnk_trial BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT membership_types_code_len CHECK (char_length(trim(code)) >= 1 AND char_length(trim(code)) <= 12),
  CONSTRAINT membership_types_trainer_pay_nonneg CHECK (trainer_pay_per_session >= 0),
  CONSTRAINT membership_types_trainer_pay_l1_nonneg CHECK (trainer_pay_l1 >= 0),
  CONSTRAINT membership_types_trainer_pay_l2_nonneg CHECK (trainer_pay_l2 >= 0),
  CONSTRAINT membership_types_trainer_pay_l3_nonneg CHECK (trainer_pay_l3 >= 0),
  CONSTRAINT membership_types_aerobic_pay_nonneg CHECK (aerobic_pay_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_types_club_code_lower
  ON membership_types (club_id, lower(trim(code)));

CREATE INDEX IF NOT EXISTS idx_membership_types_club_id ON membership_types (club_id);

-- ------------------------------------------------------------
-- План ЗП клуба (пороги тренировок → уровни 1–3)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_trainer_pay_plan_settings (
  club_id UUID PRIMARY KEY REFERENCES clubs (id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Кабинет тренера: on_plan + ±₽ к ставке за тренировку
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_pay_profiles (
  trainer_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  on_plan BOOLEAN NOT NULL DEFAULT true,
  rate_adjustment_rub NUMERIC(10, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_pay_profiles_club_id ON trainer_pay_profiles (club_id);

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
  membership_type_id UUID REFERENCES membership_types (id) ON DELETE SET NULL,
  paid_amount NUMERIC(12, 2) NULL CHECK (paid_amount IS NULL OR paid_amount >= 0),
  session_visits JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memberships_client_id ON memberships (client_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club_id ON memberships (club_id);
CREATE INDEX IF NOT EXISTS idx_memberships_membership_type_id ON memberships (membership_type_id)
  WHERE membership_type_id IS NOT NULL;

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
-- Продукты питания (справочник клуба для рациона)
-- ------------------------------------------------------------
CREATE TABLE nutrition_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  macro_group TEXT NOT NULL CHECK (macro_group IN ('protein', 'fat', 'carbs')),
  protein_per100 NUMERIC(6, 2) NOT NULL DEFAULT 0,
  fat_per100 NUMERIC(6, 2) NOT NULL DEFAULT 0,
  carbs_per100 NUMERIC(6, 2) NOT NULL DEFAULT 0,
  piece_grams NUMERIC(6, 2),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_products_club_id ON nutrition_products (club_id);

-- ------------------------------------------------------------
-- Шаблоны домашних заданий (калькулятор ДЗ)
-- ------------------------------------------------------------
CREATE TABLE homework_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT '',
  description TEXT,
  items JSONB NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homework_presets_club_id ON homework_presets (club_id);

-- ------------------------------------------------------------
-- Тренировки (payload в data JSONB — см. TrainingForm / TrainingPage)
-- ------------------------------------------------------------
CREATE TABLE trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES users (id),
  club_id UUID NOT NULL REFERENCES clubs (id),
  date DATE NOT NULL,
  type TEXT CHECK (type IN ('Силовая', 'Функциональная', 'Кардио', 'Смешанная', 'Списание')),
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
  initial_weight_kg NUMERIC(6, 2),
  current_weight_kg NUMERIC(6, 2),
  weight_updated_at TIMESTAMPTZ,
  goal TEXT,
  sex TEXT CHECK (sex IS NULL OR sex IN ('male', 'female')),
  health_filled_at DATE,
  diseases TEXT,
  contraindications TEXT,
  medications TEXT,
  notes TEXT,
  nutrition_survey JSONB,
  nutrition_plan JSONB,
  nutrition_plan_generated_at TIMESTAMPTZ,
  nutrition_plan_history JSONB NOT NULL DEFAULT '[]'::jsonb,
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

CREATE TABLE client_weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL CHECK (weight_kg > 0),
  source TEXT NOT NULL CHECK (source IN ('manual', 'training', 'baseline', 'initial_adjust')),
  training_id UUID REFERENCES trainings (id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_weight_entries_client_date ON client_weight_entries (client_id, date DESC, created_at DESC);

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
  reference_weight_kg NUMERIC(8, 2) CHECK (reference_weight_kg IS NULL OR reference_weight_kg > 0),
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

-- ------------------------------------------------------------
-- Журнал клубных SMS (Мои Звонки)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  sent_by UUID REFERENCES users (id) ON DELETE SET NULL,
  scenario TEXT NOT NULL DEFAULT 'custom',
  message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_sms_log_scenario_check CHECK (
    scenario IN ('birthdays', 'expiring', 'expired_recent', 'stale', 'custom')
  ),
  CONSTRAINT club_sms_log_preview_len CHECK (
    message_preview IS NULL OR char_length(message_preview) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_club_sms_log_club_created
  ON club_sms_log (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_sms_log_club_client_created
  ON club_sms_log (club_id, client_id, created_at DESC);
