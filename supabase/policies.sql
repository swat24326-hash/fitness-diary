-- =============================================================================
-- FIT-CITY — Row Level Security (public.clients, trainings, memberships,
--            health_cards, body_measurements)
-- =============================================================================
-- Предположения:
--   • public.users.id = auth.uid() для залогиненного пользователя (как в Edge create-trainer).
--   • Роли: admin (полный доступ к строкам), trainer (только свой club_id и свои client_id / trainer_id).
-- Вспомогательные функции — SECURITY DEFINER, чтобы обходить RLS на users при проверке роли.
--
-- Применение:
--   npm run db:migrate
--   либо вставить файл в Supabase SQL Editor.
--
-- Идемпотентность: DROP POLICY IF EXISTS + CREATE OR REPLACE функций.

-- -----------------------------------------------------------------------------
-- Вспомогательные функции (не используйте service_role в браузере — только здесь на сервере)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_clients_admin_all ON public.clients;
DROP POLICY IF EXISTS fit_clients_trainer_rw ON public.clients;

CREATE POLICY fit_clients_admin_all
  ON public.clients
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_clients_trainer_rw
  ON public.clients
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND clients.trainer_id = auth.uid()
    AND clients.club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND clients.trainer_id = auth.uid()
    AND clients.club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- memberships (связь через client_id → clients.trainer_id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_memberships_admin_all ON public.memberships;
DROP POLICY IF EXISTS fit_memberships_trainer_rw ON public.memberships;

CREATE POLICY fit_memberships_admin_all
  ON public.memberships
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_memberships_trainer_rw
  ON public.memberships
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = memberships.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = memberships.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = memberships.club_id
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- membership_types (справочник клуба; правки — админ, чтение — тренер своего клуба)
-- -----------------------------------------------------------------------------
ALTER TABLE public.membership_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_membership_types_admin_all ON public.membership_types;
DROP POLICY IF EXISTS fit_membership_types_trainer_read ON public.membership_types;

CREATE POLICY fit_membership_types_admin_all
  ON public.membership_types
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

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

-- -----------------------------------------------------------------------------
-- trainings
-- -----------------------------------------------------------------------------
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_trainings_admin_all ON public.trainings;
DROP POLICY IF EXISTS fit_trainings_trainer_rw ON public.trainings;

CREATE POLICY fit_trainings_admin_all
  ON public.trainings
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_trainings_trainer_rw
  ON public.trainings
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND trainings.trainer_id = auth.uid()
    AND trainings.club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND trainings.trainer_id = auth.uid()
    AND trainings.club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- health_cards (одна запись на client_id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_health_cards_admin_all ON public.health_cards;
DROP POLICY IF EXISTS fit_health_cards_trainer_rw ON public.health_cards;

CREATE POLICY fit_health_cards_admin_all
  ON public.health_cards
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_health_cards_trainer_rw
  ON public.health_cards
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = health_cards.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = health_cards.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- body_measurements
-- -----------------------------------------------------------------------------
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_body_measurements_admin_all ON public.body_measurements;
DROP POLICY IF EXISTS fit_body_measurements_trainer_rw ON public.body_measurements;

CREATE POLICY fit_body_measurements_admin_all
  ON public.body_measurements
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_body_measurements_trainer_rw
  ON public.body_measurements
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = body_measurements.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = body_measurements.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- client_weight_entries
-- -----------------------------------------------------------------------------
ALTER TABLE public.client_weight_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_client_weight_entries_admin_all ON public.client_weight_entries;
DROP POLICY IF EXISTS fit_client_weight_entries_trainer_rw ON public.client_weight_entries;

CREATE POLICY fit_client_weight_entries_admin_all
  ON public.client_weight_entries
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_client_weight_entries_trainer_rw
  ON public.client_weight_entries
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_weight_entries.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_weight_entries.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- client_weight_entries
-- -----------------------------------------------------------------------------
ALTER TABLE public.client_weight_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_client_weight_entries_admin_all ON public.client_weight_entries;
DROP POLICY IF EXISTS fit_client_weight_entries_trainer_rw ON public.client_weight_entries;

CREATE POLICY fit_client_weight_entries_admin_all
  ON public.client_weight_entries
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_client_weight_entries_trainer_rw
  ON public.client_weight_entries
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_weight_entries.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_weight_entries.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );
