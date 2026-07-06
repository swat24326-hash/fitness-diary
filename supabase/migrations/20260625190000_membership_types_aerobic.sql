ALTER TABLE public.membership_types
ADD COLUMN IF NOT EXISTS trainer_assignable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.membership_types
ADD COLUMN IF NOT EXISTS aerobic_pay_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.membership_types
DROP CONSTRAINT IF EXISTS membership_types_aerobic_pay_nonneg;

ALTER TABLE public.membership_types
ADD CONSTRAINT membership_types_aerobic_pay_nonneg CHECK (aerobic_pay_amount >= 0);

DROP POLICY IF EXISTS fit_membership_types_trainer_read ON public.membership_types;

CREATE POLICY fit_membership_types_trainer_read
  ON public.membership_types
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
    AND trainer_assignable IS NOT DISTINCT FROM true
  );
