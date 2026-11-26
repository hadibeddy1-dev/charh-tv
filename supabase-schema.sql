create table if not exists public.profiles (
  id uuid primary key,
  username text not null check (char_length(username) between 2 and 24),
  country text not null,
  is_online boolean not null default true,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.waiting_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  country text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  country text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  check (user_a <> user_b)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 160),
  created_at timestamptz not null default now()
);

create table if not exists public.webrtc_signals (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('offer', 'answer', 'ice')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.waiting_queue enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.webrtc_signals enable row level security;

drop policy if exists "public profiles read" on public.profiles;
drop policy if exists "public profiles write" on public.profiles;
drop policy if exists "public queue read" on public.waiting_queue;
drop policy if exists "public queue write" on public.waiting_queue;
drop policy if exists "public matches read" on public.matches;
drop policy if exists "public matches write" on public.matches;
drop policy if exists "public messages read" on public.messages;
drop policy if exists "public messages write" on public.messages;
drop policy if exists "public webrtc read" on public.webrtc_signals;
drop policy if exists "public webrtc write" on public.webrtc_signals;

create policy "public profiles read" on public.profiles for select using (true);
create policy "public profiles write" on public.profiles for all using (true) with check (true);

create policy "public queue read" on public.waiting_queue for select using (true);
create policy "public queue write" on public.waiting_queue for all using (true) with check (true);

create policy "public matches read" on public.matches for select using (true);
create policy "public matches write" on public.matches for all using (true) with check (true);

create policy "public messages read" on public.messages for select using (true);
create policy "public messages write" on public.messages for all using (true) with check (true);

create policy "public webrtc read" on public.webrtc_signals for select using (true);
create policy "public webrtc write" on public.webrtc_signals for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.matches;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.webrtc_signals;
exception
  when duplicate_object then null;
end $$;
