-- FatSecret-style: +2 доп. приёма (всего 6) — рацион на 5 приёмов без схлопывания в один «Перекус».

ALTER TABLE public.client_food_diary_entries
  DROP CONSTRAINT IF EXISTS client_food_diary_entries_meal_key_check;

ALTER TABLE public.client_food_diary_entries
  ADD CONSTRAINT client_food_diary_entries_meal_key_check
  CHECK (
    meal_key IN (
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'extra_1',
      'extra_2'
    )
  );

COMMENT ON CONSTRAINT client_food_diary_entries_meal_key_check ON public.client_food_diary_entries IS
  'База 4 + extra_1/extra_2 (как Custom Meals FatSecret, урезанно)';
