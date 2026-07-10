-- Индексы под админ-журнал и фильтры (см. supabase/scalability_indexes.sql).
-- Безопасно повторно: IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_trainings_date_desc ON public.trainings (date DESC);
CREATE INDEX IF NOT EXISTS idx_trainings_club_id ON public.trainings (club_id);
CREATE INDEX IF NOT EXISTS idx_trainings_trainer_id ON public.trainings (trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainings_client_id ON public.trainings (client_id);
CREATE INDEX IF NOT EXISTS idx_trainings_status ON public.trainings (status);
CREATE INDEX IF NOT EXISTS idx_trainings_club_date_desc ON public.trainings (club_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_trainings_trainer_date_desc ON public.trainings (trainer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_health_cards_client_id ON public.health_cards (client_id);
CREATE INDEX IF NOT EXISTS idx_clients_club_id ON public.clients (club_id);
