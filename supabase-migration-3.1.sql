-- Обновление базы до версии приложения 3.1.0.
-- Сотрудник тоже может заводить проекты и задачи в своей команде.
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Скрипт безопасно запускать повторно.

-- Раньше создавать проекты могли только владелец и лидер. Теперь это умеет
-- любой участник команды — но только внутри своей команды.
-- Удаление осталось за владельцем и лидером: снести чужой проект вместе со
-- всеми задачами — не то действие, которое стоит раздавать всем.

drop policy if exists projects_write  on public.projects;
drop policy if exists projects_create on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;

create policy projects_create on public.projects
  for insert to authenticated
  with check (public.my_role() = 'owner' or team_id = public.my_team());

create policy projects_update on public.projects
  for update to authenticated
  using (public.my_role() = 'owner' or team_id = public.my_team())
  with check (public.my_role() = 'owner' or team_id = public.my_team());

create policy projects_delete on public.projects
  for delete to authenticated
  using (
    public.my_role() = 'owner'
    or (public.my_role() = 'leader' and team_id = public.my_team())
  );

-- Задачи участники команды и так могли заводить — правило не меняется.
