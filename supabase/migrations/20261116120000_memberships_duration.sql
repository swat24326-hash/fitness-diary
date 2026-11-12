-- Снимок длительности пакета: при сдвиге/активации конец считается заново от нового старта.
-- months: с числа на число; 1.5 = +1 календарный месяц + 14 дней; days: N дней включительно.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS duration_unit text,
  ADD COLUMN IF NOT EXISTS duration_count numeric;

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_duration_unit_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_duration_unit_check
  CHECK (
    duration_unit IS NULL
    OR duration_unit IN ('months', 'days')
  );

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_duration_count_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_duration_count_check
  CHECK (
    duration_count IS NULL
    OR duration_count > 0
  );

COMMENT ON COLUMN public.memberships.duration_unit IS
  'Единица пакета: months | days. NULL = legacy (сдвиг по длине в днях из дат).';

COMMENT ON COLUMN public.memberships.duration_count IS
  'Число единиц: для months — 1, 1.5, 2…; для days — целое N. 1.5 мес = +1 календарный месяц + 14 дней.';
