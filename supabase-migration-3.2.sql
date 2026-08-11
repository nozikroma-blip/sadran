-- Обновление базы до версии приложения 3.2.0: вход через OAuth для коннектора
-- Claude/ChatGPT. Выполнить в Supabase: SQL Editor -> New query -> Run.
-- Скрипт безопасно запускать повторно.

-- Клиенты регистрируются сами (Dynamic Client Registration): Claude при
-- добавлении коннектора присылает свои адреса возврата и получает client_id.
create table if not exists public.oauth_clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

-- Код авторизации живёт минуты и обменивается на токен ровно один раз.
create table if not exists public.oauth_codes (
  code           text primary key,
  client_id      uuid not null references public.oauth_clients (id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,          -- PKCE, метод S256
  session        jsonb not null,         -- токены пользователя от Supabase Auth
  used           boolean not null default false,
  expires_at     timestamptz not null default now() + interval '10 minutes'
);

create index if not exists oauth_codes_expiry_idx on public.oauth_codes (expires_at);

-- Обе таблицы обслуживает только сама функция (service_role, который RLS
-- обходит). Обычным пользователям доступа нет — правил не заводим,
-- включённый RLS без политик закрывает таблицу целиком.
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes   enable row level security;

-- Чистка просроченных кодов: вызывается функцией при каждом обмене.
create or replace function public.purge_oauth_codes()
returns void language sql security definer set search_path = public as $$
  delete from public.oauth_codes where expires_at < now();
$$;
