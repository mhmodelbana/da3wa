-- Supabase schema for Da3wa admin dashboard
-- Safe frontend pattern: public page reads a view exposing ONLY invitation data.

create extension if not exists pgcrypto;

create table if not exists public.wedding_settings (
  id integer primary key default 1 check (id = 1),
  owner_id uuid references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wedding_settings enable row level security;

-- Do not expose the base table to anonymous visitors.
revoke all on table public.wedding_settings from anon;
revoke all on table public.wedding_settings from authenticated;

grant select, insert, update, delete on table public.wedding_settings to authenticated;

drop policy if exists "owner_insert_invitation" on public.wedding_settings;
create policy "owner_insert_invitation"
on public.wedding_settings for insert to authenticated
with check (auth.uid() = owner_id and id = 1);

drop policy if exists "owner_update_invitation" on public.wedding_settings;
create policy "owner_update_invitation"
on public.wedding_settings for update to authenticated
using (auth.uid() = owner_id and id = 1)
with check (auth.uid() = owner_id and id = 1);

drop policy if exists "owner_delete_invitation" on public.wedding_settings;
create policy "owner_delete_invitation"
on public.wedding_settings for delete to authenticated
using (auth.uid() = owner_id and id = 1);

-- Public read-only view: exposes invitation content but not owner_id/update metadata.
drop view if exists public.wedding_public;
create view public.wedding_public as
select data from public.wedding_settings where id = 1;

grant select on public.wedding_public to anon, authenticated;

create or replace function public.set_wedding_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wedding_settings_updated_at on public.wedding_settings;
create trigger wedding_settings_updated_at
before update on public.wedding_settings
for each row execute function public.set_wedding_settings_updated_at();
