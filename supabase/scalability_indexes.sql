-- Индексы под админ-журнал: фильтры + сортировка по дате (см. loadAdminJournalPage).
-- Применить вручную в SQL Editor Supabase или через миграцию после проверки нагрузки.

-- Сортировка по дате (основной сценарий списка)
CREATE INDEX IF NOT EXISTS idx_trainings_date_desc ON trainings (date DESC);

-- Типичные фильтры по отдельности
CREATE INDEX IF NOT EXISTS idx_trainings_club_id ON trainings (club_id);
CREATE INDEX IF NOT EXISTS idx_trainings_trainer_id ON trainings (trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainings_client_id ON trainings (client_id);
CREATE INDEX IF NOT EXISTS idx_trainings_status ON trainings (status);

-- Составной индекс: клуб + дата (частый кейс «журнал по залу»)
CREATE INDEX IF NOT EXISTS idx_trainings_club_date_desc ON trainings (club_id, date DESC);

-- Составной: тренер + дата
CREATE INDEX IF NOT EXISTS idx_trainings_trainer_date_desc ON trainings (trainer_id, date DESC);

-- Медкарты: выборка по списку client_id (админ-журнал)
CREATE INDEX IF NOT EXISTS idx_health_cards_client_id ON health_cards (client_id);

-- Клиенты: фильтр журнала по клубу (searchAdminClientsRemote + club_id)
CREATE INDEX IF NOT EXISTS idx_clients_club_id ON clients (club_id);
-- Поиск подстроки ilike('%x%') по name не использует обычный B-tree; при десятках тысяч клиентов —
-- включите pg_trgm и, например: CREATE INDEX ON clients USING gin (name gin_trgm_ops);
