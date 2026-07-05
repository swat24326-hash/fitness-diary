-- Уровни плана = суммы на повышение менеджеров (не категории НК/ДК/УК).
ALTER TABLE public.club_sales_plan
  RENAME COLUMN plan_nk TO plan_level_1;
ALTER TABLE public.club_sales_plan
  RENAME COLUMN plan_dk TO plan_level_2;
ALTER TABLE public.club_sales_plan
  RENAME COLUMN plan_uk TO plan_level_3;
