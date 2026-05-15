-- Пример политик RLS для администратора (role = 'admin' в public.users).
-- Актуальные политики для clients / trainings / memberships / health_cards / body_measurements
-- см. в файле **`supabase/policies.sql`** и применяйте через `npm run db:migrate` или SQL Editor.
-- Подставьте под свою схему: имена таблиц и способ связи auth.uid() с users.
-- Выполняйте в SQL Editor Supabase после включения RLS на таблицах.

-- Предположение: в таблице public.users поле id = auth.uid() для залогиненного пользователя.

-- create policy "admin_select_trainings"
-- on public.trainings for select
-- using (
--   exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
-- );

-- Аналогично для clients, trainings, health_cards, memberships, body_measurements,
-- exercises, clubs, users (чтение для журнала и карточки клиента в админке).

-- После добавления колонки users.club_id — разрешите админу обновлять привязку тренера к клубу:
-- create policy "admin_update_trainers_club"
-- on public.users for update
-- using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
-- with check (role = 'trainer' or role = 'admin');

-- Для тренеров — политики обычно ограничивают clients/trainings по trainer_id = auth.uid().
-- Настройте так, чтобы admin имел select по всем строкам, а trainer — только свои.
