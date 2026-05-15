-- Цель клиента (вкладка «Здоровье» в карточке клиента).
-- Храним в health_cards, чтобы цель была частью медкарты и доступна тренеру/админу.

DO $$
BEGIN
  ALTER TABLE public.health_cards
    ADD COLUMN goal text;
EXCEPTION
  WHEN duplicate_column THEN
    NULL;
END $$;

COMMENT ON COLUMN public.health_cards.goal IS 'Цель клиента (напр. снижение веса, набор массы, выносливость).';

