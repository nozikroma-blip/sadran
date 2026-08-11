-- Обновление базы до версии приложения 2.0.0: команды.
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Существующие проекты и задачи сохраняются: они переедут в команду «Основная».
-- Скрипт безопасно запускать повторно.

-- ============ 1. Таблица команд ============

create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  leader_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  begin alter table public.teams add constraint teams_name_len check (char_length(name) <= 40);
  exception when duplicate_object then null; end;
end;
$$;

create unique index if not exists teams_name_uniq on public.teams (lower(btrim(name)));

-- ============ 2. Роль и команда у человека ============
-- owner  — владелец, видит все команды и все проекты;
-- leader — лидер команды, распоряжается своими людьми и своими проектами;
-- member — сотрудник, видит проекты своей команды.

alter table public.profiles add column if not exists team_id uuid references public.teams (id) on delete set null;
alter table public.profiles add column if not exists role    text not null default 'member';

do $$
begin
  begin alter table public.profiles add constraint profiles_role_valid check (role in ('owner', 'leader', 'member'));
  exception when duplicate_object then null; end;
end;
$$;

-- Владельцем становится тот, кто зарегистрировался первым, — если владельца ещё нет.
update public.profiles set role = 'owner'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'owner');

-- ============ 3. Проект принадлежит команде ============

alter table public.projects add column if not exists team_id uuid references public.teams (id) on delete cascade;

-- Первый запуск: заводим команду «Основная» и переносим в неё всё, что уже есть.
do $$
declare
  default_team uuid;
  owner_id     uuid;
begin
  if not exists (select 1 from public.teams) then
    select id into owner_id from public.profiles where role = 'owner' limit 1;
    insert into public.teams (name, leader_id) values ('Основная', owner_id)
      returning id into default_team;
  else
    select id into default_team from public.teams order by created_at limit 1;
  end if;

  update public.profiles set team_id = default_team where team_id is null;
  update public.projects set team_id = default_team where team_id is null;
end;
$$;

alter table public.projects alter column team_id set not null;

-- Номера и названия уникальны теперь внутри команды, а не по всей базе:
-- у разных команд вполне может быть проект с одинаковым названием.
drop index if exists public.projects_name_uniq;
drop index if exists public.projects_code_uniq;

create unique index if not exists projects_name_uniq
  on public.projects (team_id, lower(btrim(name)));

create unique index if not exists projects_code_uniq
  on public.projects (team_id, lower(btrim(code)))
  where btrim(code) <> '';

-- ============ 4. Кто я такой ============
-- security definer — функции читают profiles в обход RLS. Без этого правила
-- доступа к profiles ссылались бы сами на себя и запрос уходил бы в рекурсию.

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- ============ 5. Кто что может менять в профилях ============
-- Правила RLS решают, какие строки видны и доступны для записи, но не какие
-- поля. Роль и команду защищаем триггером: иначе сотрудник смог бы сам
-- переписать себе role = 'owner' или перейти в чужую команду.

create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_role text;
  actor_team uuid;
begin
  select role, team_id into actor_role, actor_team from public.profiles where id = auth.uid();

  if actor_role = 'owner' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Менять роль может только владелец';
  end if;

  if new.team_id is distinct from old.team_id then
    if actor_role <> 'leader' then
      raise exception 'Менять команду сотрудника может только лидер или владелец';
    end if;
    -- Лидер вправе взять человека без команды к себе и убрать своего из команды.
    if coalesce(new.team_id, actor_team) <> actor_team
       or (old.team_id is not null and old.team_id <> actor_team) then
      raise exception 'Лидер может распоряжаться только своей командой';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- ============ 6. Исполнитель — только из команды проекта ============

create or replace function public.check_assignee_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  project_team  uuid;
  assignee_team uuid;
begin
  if new.assignee_id is null then
    return new;
  end if;

  select team_id into project_team  from public.projects where id = new.project_id;
  select team_id into assignee_team from public.profiles where id = new.assignee_id;

  if assignee_team is distinct from project_team then
    raise exception 'Исполнитель не состоит в команде этого проекта';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_assignee_team on public.tasks;
create trigger tasks_assignee_team
  before insert or update on public.tasks
  for each row execute function public.check_assignee_team();

-- ============ 7. Профиль при регистрации ============
-- Первый зарегистрировавшийся становится владельцем, остальные — сотрудниками
-- без команды: их подбирает лидер.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 20),
    case when not exists (select 1 from public.profiles) then 'owner' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============ 8. Права доступа ============

alter table public.teams enable row level security;

-- ---- Команды ----
drop policy if exists teams_read  on public.teams;
drop policy if exists teams_write on public.teams;

create policy teams_read on public.teams
  for select to authenticated
  using (public.my_role() = 'owner' or id = public.my_team());

create policy teams_write on public.teams
  for all to authenticated
  using (public.my_role() = 'owner')
  with check (public.my_role() = 'owner');

-- ---- Профили ----
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;

-- Лидеру видны ещё и люди без команды — иначе он не смог бы их найти и позвать.
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    public.my_role() = 'owner'
    or id = auth.uid()
    or (team_id is not null and team_id = public.my_team())
    or (public.my_role() = 'leader' and team_id is null)
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    public.my_role() = 'owner'
    or id = auth.uid()
    or (public.my_role() = 'leader' and (team_id = public.my_team() or team_id is null))
  )
  with check (
    public.my_role() = 'owner'
    or id = auth.uid()
    or (public.my_role() = 'leader' and (team_id = public.my_team() or team_id is null))
  );

-- ---- Проекты ----
drop policy if exists projects_all   on public.projects;
drop policy if exists projects_read  on public.projects;
drop policy if exists projects_write on public.projects;

create policy projects_read on public.projects
  for select to authenticated
  using (public.my_role() = 'owner' or team_id = public.my_team());

-- Создавать, переименовывать и удалять проекты может лидер и владелец.
create policy projects_write on public.projects
  for all to authenticated
  using (
    public.my_role() = 'owner'
    or (public.my_role() = 'leader' and team_id = public.my_team())
  )
  with check (
    public.my_role() = 'owner'
    or (public.my_role() = 'leader' and team_id = public.my_team())
  );

-- ---- Задачи ----
drop policy if exists tasks_all   on public.tasks;
drop policy if exists tasks_read  on public.tasks;
drop policy if exists tasks_write on public.tasks;

-- Задачи внутри своей команды заводит и правит любой её участник.
create policy tasks_read on public.tasks
  for select to authenticated
  using (
    public.my_role() = 'owner'
    or exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.team_id = public.my_team()
    )
  );

create policy tasks_write on public.tasks
  for all to authenticated
  using (
    public.my_role() = 'owner'
    or exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.team_id = public.my_team()
    )
  )
  with check (
    public.my_role() = 'owner'
    or exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.team_id = public.my_team()
    )
  );

-- ============ 9. Мгновенные обновления ============

do $$
begin
  begin alter publication supabase_realtime add table public.teams; exception when duplicate_object then null; end;
end;
$$;

-- Проверить, что получилось:
--   select email, role, team_id from public.profiles;
--   select name, leader_id from public.teams;
