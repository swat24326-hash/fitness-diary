-- Менеджер продаж читает все типы абонементов своего клуба (включая АЗ),
-- иначе дневной отчёт берёт устаревший локальный кэш без новых колонок (R3+ и т.п.).

DROP POLICY IF EXISTS fit_membership_types_sales_manager_read ON public.membership_types;

CREATE POLICY fit_membership_types_sales_manager_read
  ON public.membership_types
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
    AND public.fit_auth_sales_manager_club_id() IS NOT NULL
  );

-- На всякий случай: R3+/R-plus, созданные как АЗ, но в облаке оставшиеся ПЗ (как раньше с R1+/R2+).
UPDATE public.membership_types
SET
  trainer_assignable = false,
  aerobic_pay_amount = GREATEST(COALESCE(trainer_pay_per_session, 0), COALESCE(aerobic_pay_amount, 0)),
  trainer_pay_per_session = 0
WHERE trainer_assignable IS NOT DISTINCT FROM true
  AND lower(trim(code)) IN ('r3+', 'r-plus', 'r-3-plus', 'r3-plus');
