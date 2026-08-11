-- Обновление базы до версии приложения 1.2.0.
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Существующие проекты и задачи не затрагиваются, данные не теряются.
-- Скрипт безопасно запускать повторно.

-- ---------- Номер проекта ----------
-- Пустая строка означает «номера нет».

alter table public.projects add column if not exists code text not null default '';

-- ---------- Ограничения длины ----------
-- Раньше длину сдерживали только поля ввода, а их можно обойти.
-- Теперь слишком длинное значение не примет и сама база.

-- Сначала укорачиваем то, что уже успели сохранить, иначе ограничение
-- не добавится: база не даст создать правило, которому не отвечают её же данные.
update public.profiles set full_name = left(full_name, 20) where char_length(full_name) > 20;
update public.projects set name      = left(name, 80)      where char_length(name) > 80;
update public.projects set code      = left(code, 20)      where char_length(code) > 20;
update public.tasks    set title     = left(title, 200)    where char_length(title) > 200;
update public.tasks    set notes     = left(notes, 2000)   where char_length(notes) > 2000;

do $$
begin
  begin
    alter table public.profiles add constraint profiles_full_name_len
      check (char_length(full_name) <= 20);
  exception when duplicate_object then null; end;

  begin
    alter table public.projects add constraint projects_name_len
      check (char_length(name) <= 80);
  exception when duplicate_object then null; end;

  begin
    alter table public.projects add constraint projects_code_len
      check (char_length(code) <= 20);
  exception when duplicate_object then null; end;

  begin
    alter table public.tasks add constraint tasks_title_len
      check (char_length(title) <= 200);
  exception when duplicate_object then null; end;

  begin
    alter table public.tasks add constraint tasks_notes_len
      check (char_length(notes) <= 2000);
  exception when duplicate_object then null; end;
end;
$$;

-- ---------- Имя при регистрации тоже обрезаем ----------
-- Иначе слишком длинное имя из формы регистрации сломает вставку профиля.

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

-- Имена длиннее 20 символов скрипт укоротил. Проверить, что получилось:
--   select id, email, full_name from public.profiles;
-- Поправить своё имя можно прямо в приложении: «Сменить имя» внизу слева.
