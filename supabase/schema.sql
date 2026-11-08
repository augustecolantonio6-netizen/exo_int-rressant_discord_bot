create extension if not exists pgcrypto;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_date date not null,
  title text not null,
  statement text not null,
  solution text not null,
  category text not null,
  difficulty text not null default 'Terminale → MPSI',
  status text not null default 'pending'
    check (status in ('pending', 'publishing', 'published', 'replaced')),
  telegram_chat_id bigint,
  telegram_message_id bigint,
  discord_message_id text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists exercises_one_active_per_day
on public.exercises (exercise_date)
where status in ('pending', 'publishing', 'published');

create index if not exists exercises_created_at_idx
on public.exercises (created_at desc);

alter table public.exercises enable row level security;
-- Aucune policy publique : seul le backend utilise la clé service_role.

-- Explicit backend grants. The secret key maps to the service_role database role.
grant usage on schema public to service_role;
grant all on table public.exercises to service_role;
