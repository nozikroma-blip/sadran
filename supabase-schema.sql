-- Схема для приложения «Проекты».
-- Выполнить один раз в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Скрипт безопасно запускать повторно.

-- ---------- Профили пользователей ----------
-- Строка появляется автоматически при регистрации (см. триггер ниже).

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------- Проекты ----------

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null default '',   -- номер проекта, пустая строка = без номера
  name        text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- Задачи ----------

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null,
  status       text not null default 'todo'
               check (status in ('todo', 'progress', 'stuck', 'done')),
  due          date,
  assignee_id  uuid references public.profiles (id) on delete set null,
  notes        text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Ограничения длины: поля ввода в приложении можно обойти, база — нет.
do $$
begin
  begin alter table public.profiles add constraint profiles_full_name_len check (char_length(full_name) <= 20); exception when duplicate_object then null; end;
  begin alter table public.projects add constraint projects_name_len     check (char_length(name) <= 80);       exception when duplicate_object then null; end;
  begin alter table public.projects add constraint projects_code_len     check (char_length(code) <= 20);       exception when duplicate_object then null; end;
  begin alter table public.tasks    add constraint tasks_title_len       check (char_length(title) <= 200);     exception when duplicate_object then null; end;
  begin alter table public.tasks    add constraint tasks_notes_len       check (char_length(notes) <= 2000);    exception when duplicate_object then null; end;
end;
$$;

-- Номера и названия проектов не повторяются (без учёта регистра и крайних пробелов).
-- Проектов без номера может быть сколько угодно, поэтому пустой номер не проверяется.
create unique index if not exists projects_name_uniq
  on public.projects (lower(btrim(name)));

create unique index if not exists projects_code_uniq
  on public.projects (lower(btrim(code)))
  where btrim(code) <> '';

create index if not exists tasks_project_idx  on public.tasks (project_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

-- updated_at обновляется автоматически при любом изменении задачи.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------- Автосоздание профиля при регистрации ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Доступ (RLS) ----------
-- Модель простая: все, кто вошёл в систему, — одна команда и видят общие проекты.
-- Незалогиненные не видят ничего.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks    enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated using (true);

-- Менять можно только собственный профиль.
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists projects_all on public.projects;
create policy projects_all on public.projects
  for all to authenticated using (true) with check (true);

drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks
  for all to authenticated using (true) with check (true);

-- ---------- Мгновенные обновления у всех участников ----------

-- duplicate_object игнорируем, чтобы скрипт можно было запускать повторно.
do $$
begin
  begin alter publication supabase_realtime add table public.projects; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tasks;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
end;
$$;
