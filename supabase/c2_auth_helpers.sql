-- C2 / bare Postgres: базовые fit_auth_* до миграций.
-- На Supabase они пришли из policies.sql раньше migrations/, а миграции с 20260518 на них опираются.
-- Тела — как в policies.sql; миграции ниже переопределяют их (CREATE OR REPLACE). Прод это не применяет.

CREATE OR REPLACE FUNCTION public.fit_auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.role IN ('admin', 'администратор')
      AND COALESCE(u.is_active, true)
      AND (
        u.id = auth.uid()
        OR (
          NULLIF(trim(lower(u.email)), '') IS NOT NULL
          AND lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.fit_auth_is_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('trainer', 'тренер')
      AND COALESCE(u.is_active, true)
  );
$$;

CREATE OR REPLACE FUNCTION public.fit_auth_trainer_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.club_id
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fit_auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fit_auth_is_trainer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fit_auth_trainer_club_id() TO authenticated;
