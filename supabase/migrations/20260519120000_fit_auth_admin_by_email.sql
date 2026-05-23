-- RLS: админ по auth.uid() ИЛИ по email из JWT (если public.users.id ещё не привязан к Auth).
-- Без этого приложение пускает admin@fit-city.ru в админку, а INSERT в clubs даёт 403.

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
    WHERE u.role = 'admin'
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

GRANT EXECUTE ON FUNCTION public.fit_auth_is_admin() TO authenticated;
