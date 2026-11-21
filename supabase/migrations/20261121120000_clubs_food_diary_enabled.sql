-- Дневник калорий клиента (аналог FatSecret): включение по клубам, по умолчанию выкл.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS food_diary_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clubs.food_diary_enabled IS
  'Клиентский дневник калорий в /me: true — показать модуль клубу; false — скрыть (пилот).';
