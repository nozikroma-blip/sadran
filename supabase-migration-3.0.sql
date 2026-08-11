-- Обновление базы до версии приложения 3.0.0.
-- Комментарии к задачам, вложения (файлы и скриншоты), предел даты 2099.
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Скрипт безопасно запускать повторно.

-- ============ 1. Дедлайн не дальше 2099 года ============

update public.tasks set due = null where due > date '2099-12-31';

do $$
begin
  begin
    alter table public.tasks add constraint tasks_due_max
      check (due is null or due <= date '2099-12-31');
  exception when duplicate_object then null; end;
end;
$$;

-- ============ 2. Комментарии ============

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_task_idx on public.comments (task_id, created_at);

do $$
begin
  begin alter table public.comments add constraint comments_body_len
    check (char_length(body) between 1 and 4000);
  exception when duplicate_object then null; end;
end;
$$;

-- ============ 3. Вложения ============
-- Сам файл лежит в хранилище Supabase, здесь — только карточка файла.

create table if not exists public.attachments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  path       text not null unique,   -- путь в бакете attachments
  name       text not null,
  mime       text not null default '',
  size_bytes bigint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists attachments_task_idx on public.attachments (task_id, created_at);

-- ============ 4. Кто имеет доступ к задаче ============
-- Одна функция вместо повторения условия в каждом правиле.

create or replace function public.can_access_task(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = target
      and (public.my_role() = 'owner' or p.team_id = public.my_team())
  );
$$;

-- ============ 5. Права на комментарии и вложения ============

alter table public.comments    enable row level security;
alter table public.attachments enable row level security;

drop policy if exists comments_read   on public.comments;
drop policy if exists comments_write  on public.comments;
drop policy if exists comments_modify on public.comments;

create policy comments_read on public.comments
  for select to authenticated
  using (public.can_access_task(task_id));

create policy comments_write on public.comments
  for insert to authenticated
  with check (public.can_access_task(task_id) and author_id = auth.uid());

-- Править и удалять комментарий может его автор; удалять — ещё и владелец.
create policy comments_modify on public.comments
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (author_id = auth.uid() or public.my_role() = 'owner');

drop policy if exists attachments_read   on public.attachments;
drop policy if exists attachments_write  on public.attachments;
drop policy if exists attachments_delete on public.attachments;

create policy attachments_read on public.attachments
  for select to authenticated
  using (public.can_access_task(task_id));

create policy attachments_write on public.attachments
  for insert to authenticated
  with check (public.can_access_task(task_id) and created_by = auth.uid());

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (created_by = auth.uid() or public.my_role() = 'owner');

-- ============ 6. Хранилище файлов ============
-- Приватный бакет: скачать файл можно только по временной ссылке,
-- которую приложение запрашивает от имени вошедшего пользователя.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)   -- 25 МБ на файл
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Первая папка в пути — id задачи: <task_id>/<случайное_имя>
drop policy if exists attachments_object_read   on storage.objects;
drop policy if exists attachments_object_write  on storage.objects;
drop policy if exists attachments_object_delete on storage.objects;

create policy attachments_object_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_access_task(((storage.foldername(name))[1])::uuid)
  );

create policy attachments_object_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.can_access_task(((storage.foldername(name))[1])::uuid)
  );

create policy attachments_object_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_access_task(((storage.foldername(name))[1])::uuid)
  );

-- ============ 7. Мгновенные обновления ============

do $$
begin
  begin alter publication supabase_realtime add table public.comments;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.attachments; exception when duplicate_object then null; end;
end;
$$;
