-- Роль «Управляющий» (supervisor): почти админ одного клуба.
-- ТЗ: docs/CLUB_SUPERVISOR.md

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IS NULL
    OR role IN (
      'admin',
      'trainer',
      'sales_manager',
      'supervisor',
      'администратор',
      'тренер',
      'менеджер по продажам',
      'управляющий'
    )
  );

CREATE OR REPLACE FUNCTION public.fit_auth_is_supervisor()
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
      AND COALESCE(u.is_active, true) = true
      AND u.role IN ('supervisor', 'управляющий')
  );
$$;

CREATE OR REPLACE FUNCTION public.fit_auth_supervisor_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.club_id
  FROM public.users u
  WHERE u.id = auth.uid()
    AND COALESCE(u.is_active, true) = true
    AND u.role IN ('supervisor', 'управляющий')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fit_auth_is_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fit_auth_supervisor_club_id() TO authenticated;

COMMENT ON FUNCTION public.fit_auth_is_supervisor() IS 'Управляющий клуба (supervisor)';
COMMENT ON FUNCTION public.fit_auth_supervisor_club_id() IS 'club_id управляющего из public.users';
