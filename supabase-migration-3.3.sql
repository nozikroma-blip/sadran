-- Обновление базы до версии приложения 3.3.0: коды привязки помощника.
-- Выполнить в Supabase: SQL Editor -> New query -> Run.
-- Скрипт безопасно запускать повторно.

-- Код создаёт само приложение от имени уже вошедшего человека и несёт в себе
-- его сессию. Поэтому на страницу привязки пароль вводить не нужно —
-- сторонний хостинг получает готовый токен, а не учётные данные.
create table if not exists public.pairing_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  session    jsonb not null,
  used       boolean not null default false,
  expires_at timestamptz not null default now() + interval '5 minutes'
);

create index if not exists pairing_codes_expiry_idx on public.pairing_codes (expires_at);

-- Таблицу обслуживают только приложение (через функцию ниже) и сервер
-- коннектора с service_role. Прямого доступа у пользователей нет:
-- включённый RLS без политик закрывает её целиком.
alter table public.pairing_codes enable row level security;

create or replace function public.purge_pairing_codes()
returns void language sql security definer set search_path = public as $$
  delete from public.pairing_codes where expires_at < now();
$$;

-- Выдача кода: приложение передаёт свою текущую сессию, получает шесть цифр.
-- security definer нужен, чтобы запись прошла мимо закрытой таблицы,
-- но привязать код к чужому пользователю нельзя — берём auth.uid().
create or replace function public.issue_pairing_code(session jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в приложение';
  end if;

  delete from public.pairing_codes where expires_at < now() or user_id = auth.uid();

  -- Шесть цифр: достаточно при пятиминутном сроке жизни и одноразовости.
  new_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.pairing_codes (code, user_id, session)
  values (new_code, auth.uid(), session);

  return new_code;
end;
$$;

revoke all on function public.issue_pairing_code(jsonb) from public;
grant execute on function public.issue_pairing_code(jsonb) to authenticated;
