-- Роли в Table Editor иногда вводят по-русски; приложение и RLS ожидали латиницу.
-- 1) Подстраиваем RLS под оба написания (в т.ч. после fit_auth_admin_by_email).
-- 2) По возможности приводим данные к схеме ('admin', 'trainer').

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

GRANT EXECUTE ON FUNCTION public.fit_auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fit_auth_is_trainer() TO authenticated;

-- Привести к латинице (если CHECK на users.role это позволяет)
UPDATE public.users SET role = 'trainer' WHERE role IN ('тренер', 'Тренер');
UPDATE public.users SET role = 'admin' WHERE role IN ('администратор', 'Администратор');
