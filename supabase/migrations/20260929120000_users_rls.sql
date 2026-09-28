-- RLS на сотрудников (public.users). До этого любой вошедший (а на Supabase и аноним по anon key)
-- читал весь список: имена, телефоны, почты — и мог писать в строки.
-- Сервер (service role / владелец таблицы) RLS не видит: вход, pull, create-trainer не меняются.
-- Функции fit_auth_* — SECURITY DEFINER от владельца, поэтому читают users в обход этих политик.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Свой профиль: по id или (старые строки, id ≠ auth.uid) по почте из токена — как ищет AuthContext.
DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (
      NULLIF(trim(lower(email)), '') IS NOT NULL
      AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Админ: весь список и правки из браузера (Организация: клуб тренера).
DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

-- Менеджер продаж и управляющий: сотрудники своего клуба (списки тренеров), только чтение.
DROP POLICY IF EXISTS users_club_staff_read ON public.users;
CREATE POLICY users_club_staff_read ON public.users
  FOR SELECT
  TO authenticated
  USING (
    club_id IS NOT NULL
    AND (
      (public.fit_auth_is_sales_manager() AND club_id = public.fit_auth_sales_manager_club_id())
      OR (public.fit_auth_is_supervisor() AND club_id = public.fit_auth_supervisor_club_id())
    )
  );
