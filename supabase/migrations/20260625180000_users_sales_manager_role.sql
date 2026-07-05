-- Роль «менеджер по продажам» — один клуб, отчёты club_sales_daily.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'admin',
      'trainer',
      'sales_manager',
      'администратор',
      'тренер',
      'менеджер по продажам'
    )
  );

CREATE OR REPLACE FUNCTION public.fit_auth_is_sales_manager()
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
      AND u.role IN ('sales_manager', 'менеджер по продажам')
      AND COALESCE(u.is_active, true)
  );
$$;

CREATE OR REPLACE FUNCTION public.fit_auth_sales_manager_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.club_id
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.role IN ('sales_manager', 'менеджер по продажам')
    AND COALESCE(u.is_active, true)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fit_auth_is_sales_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fit_auth_sales_manager_club_id() TO authenticated;

ALTER TABLE public.club_sales_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_sales_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_sales_daily_admin ON public.club_sales_daily;
CREATE POLICY club_sales_daily_admin ON public.club_sales_daily
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

DROP POLICY IF EXISTS club_sales_daily_sales_manager ON public.club_sales_daily;
CREATE POLICY club_sales_daily_sales_manager ON public.club_sales_daily
  FOR ALL
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  )
  WITH CHECK (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  );

DROP POLICY IF EXISTS club_sales_plan_admin ON public.club_sales_plan;
CREATE POLICY club_sales_plan_admin ON public.club_sales_plan
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

DROP POLICY IF EXISTS club_sales_plan_sales_manager_read ON public.club_sales_plan;
CREATE POLICY club_sales_plan_sales_manager_read ON public.club_sales_plan
  FOR SELECT
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  );

DROP POLICY IF EXISTS club_sales_plan_sales_manager_directions ON public.club_sales_plan;
CREATE POLICY club_sales_plan_sales_manager_directions ON public.club_sales_plan
  FOR UPDATE
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  )
  WITH CHECK (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  );

DROP POLICY IF EXISTS club_sales_plan_sales_manager_insert ON public.club_sales_plan;
CREATE POLICY club_sales_plan_sales_manager_insert ON public.club_sales_plan
  FOR INSERT
  WITH CHECK (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  );
