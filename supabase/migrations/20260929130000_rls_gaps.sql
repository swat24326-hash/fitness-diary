-- RLS на таблицы, где его не было (аудит 2026-09-29). Без RLS anon key из бандла читал и писал:
-- расходы управляющего, push-подписки сотрудников, челленджи клубов.
-- Сервер (service role / владелец таблиц) RLS не видит: push, admin-data, web-push не меняются.
-- Браузер ходит сюда только запасным путём, когда /api недоступен, — политики повторяют права API.

-- Расходы клуба: как admin-data?action=sales-finance (requireAdminOrSupervisor). Менеджеру продаж финансы не отдаются.
ALTER TABLE public.club_supervisor_expense ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_supervisor_expense_admin ON public.club_supervisor_expense;
CREATE POLICY club_supervisor_expense_admin ON public.club_supervisor_expense
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

DROP POLICY IF EXISTS club_supervisor_expense_supervisor ON public.club_supervisor_expense;
CREATE POLICY club_supervisor_expense_supervisor ON public.club_supervisor_expense
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_supervisor() AND club_id = public.fit_auth_supervisor_club_id())
  WITH CHECK (public.fit_auth_is_supervisor() AND club_id = public.fit_auth_supervisor_club_id());

-- Push-подписки: только сервер (pushSubscriptionHandler, webPushCore). Политик нет намеренно — из браузера закрыто.
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Челленджи: читают админ и сотрудники своего клуба (запасной pull). Пишет только сервер через push.
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenges_club_read ON public.challenges;
CREATE POLICY challenges_club_read ON public.challenges
  FOR SELECT
  TO authenticated
  USING (public.fit_auth_is_admin() OR club_id = public.fit_auth_trainer_club_id());

-- Каталог упражнений: на проде RLS уже включён вручную (exercises_select_policy / exercises_modify_policy).
-- Здесь — эталон в репо для C2; на проде политики добавляются к существующим и доступ не меняют.
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exercises_authenticated_read ON public.exercises;
CREATE POLICY exercises_authenticated_read ON public.exercises
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS exercises_admin_all ON public.exercises;
CREATE POLICY exercises_admin_all ON public.exercises
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
