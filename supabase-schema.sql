-- Da3wa Multi-Invitation Supabase schema
-- Run this file in Supabase SQL Editor.
-- IMPORTANT: never put a secret/service-role key in frontend code.

create extension if not exists pgcrypto;

create table if not exists public.wedding_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null default 'دعوة زفاف',
  published boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wedding_invitations_owner_idx on public.wedding_invitations(owner_id);
create index if not exists wedding_invitations_slug_idx on public.wedding_invitations(slug);
create index if not exists wedding_invitations_published_idx on public.wedding_invitations(published);

alter table public.wedding_invitations enable row level security;

revoke all on table public.wedding_invitations from anon;
revoke all on table public.wedding_invitations from authenticated;

grant select on table public.wedding_invitations to anon, authenticated;
grant insert, update, delete on table public.wedding_invitations to authenticated;

drop policy if exists "public can read published invitations" on public.wedding_invitations;
create policy "public can read published invitations"
on public.wedding_invitations
for select
to anon
using (published = true);

drop policy if exists "owners can read invitations" on public.wedding_invitations;
create policy "owners can read invitations"
on public.wedding_invitations
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "owners can insert invitations" on public.wedding_invitations;
create policy "owners can insert invitations"
on public.wedding_invitations
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owners can update invitations" on public.wedding_invitations;
create policy "owners can update invitations"
on public.wedding_invitations
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners can delete invitations" on public.wedding_invitations;
create policy "owners can delete invitations"
on public.wedding_invitations
for delete
to authenticated
using (owner_id = auth.uid());

create or replace function public.set_wedding_invitations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_wedding_invitations_updated_at on public.wedding_invitations;
create trigger set_wedding_invitations_updated_at
before update on public.wedding_invitations
for each row execute function public.set_wedding_invitations_updated_at();

create or replace view public.wedding_public
with (security_invoker = true)
as
select
  id,
  slug,
  title,
  data,
  updated_at
from public.wedding_invitations
where published = true;

grant select on public.wedding_public to anon, authenticated;

-- Optional hardening: prevent authenticated users from changing ownership.
create or replace function public.prevent_wedding_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_wedding_owner_change on public.wedding_invitations;
create trigger prevent_wedding_owner_change
before update on public.wedding_invitations
for each row execute function public.prevent_wedding_owner_change();
