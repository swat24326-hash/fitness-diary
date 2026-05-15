-- Опциональное описание челленджа для тренеров и клиентов.

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS description TEXT;
