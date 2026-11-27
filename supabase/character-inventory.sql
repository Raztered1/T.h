-- v0.7.2 — Convites por ficha, biblioteca e inventário privado
create extension if not exists pgcrypto;

create table if not exists public.campaign_characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  sheet_data jsonb not null default '{}'::jsonb,
  assigned_user_id uuid references auth.users(id) on delete set null,
  edit_mode text not null default 'limited' check (edit_mode in ('limited','full','readonly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaign_characters_campaign_idx on public.campaign_characters(campaign_id);
create index if not exists campaign_characters_user_idx on public.campaign_characters(assigned_user_id);

create table if not exists public.character_invites (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.campaign_characters(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null default 'Outro',
  rarity text not null default 'Comum',
  description text not null default '',
  effect text not null default '',
  healing text not null default '',
  image_url text not null default '',
  weight numeric(10,2),
  value numeric(12,2),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaign_items_campaign_idx on public.campaign_items(campaign_id);

create table if not exists public.character_inventory (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.campaign_characters(id) on delete cascade,
  item_id uuid references public.campaign_items(id) on delete set null,
  item_snapshot jsonb not null default '{}'::jsonb,
  quantity integer not null default 1 check (quantity >= 0),
  created_at timestamptz not null default now(),
  unique(character_id,item_id)
);

create or replace function public.is_character_owner(target_character uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.campaign_characters c where c.id=target_character and c.assigned_user_id=auth.uid());
$$;
create or replace function public.is_character_gm(target_character uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.campaign_characters c join public.campaigns p on p.id=c.campaign_id where c.id=target_character and p.owner_id=auth.uid());
$$;

create or replace function public.create_character_invite(target_character uuid)
returns text language plpgsql security definer set search_path=public as $$
declare raw_token text; owner_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  select p.owner_id into owner_id from campaign_characters c join campaigns p on p.id=c.campaign_id where c.id=target_character;
  if owner_id is null or owner_id <> auth.uid() then raise exception 'Somente o mestre pode criar convites.'; end if;
  raw_token := encode(gen_random_bytes(32),'hex');
  insert into character_invites(character_id,token_hash,created_by) values(target_character,encode(digest(raw_token,'sha256'),'hex'),auth.uid());
  return raw_token;
end; $$;

create or replace function public.accept_character_invite(invite_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare inv character_invites%rowtype; ch campaign_characters%rowtype; camp campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta antes de aceitar o convite.'; end if;
  if invite_token is null or length(invite_token) < 32 then raise exception 'Link de convite inválido.'; end if;
  select * into inv from character_invites where token_hash=encode(digest(invite_token,'sha256'),'hex') for update;
  if inv.id is null or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at < now() then raise exception 'Este convite é inválido, expirou ou já foi utilizado.'; end if;
  select * into ch from campaign_characters where id=inv.character_id for update;
  if ch.assigned_user_id is not null and ch.assigned_user_id <> auth.uid() then raise exception 'Esta ficha já está vinculada a outro jogador.'; end if;
  select * into camp from campaigns where id=ch.campaign_id;
  update campaign_characters set assigned_user_id=auth.uid(), edit_mode='limited', updated_at=now() where id=ch.id;
  insert into campaign_members(campaign_id,user_id,role) values(ch.campaign_id,auth.uid(),'member') on conflict do nothing;
  update character_invites set accepted_by=auth.uid(),accepted_at=now() where id=inv.id;
  return jsonb_build_object('character_id',ch.id,'character_name',ch.name,'campaign_id',camp.id,'campaign_name',camp.name);
end; $$;

create or replace function public.grant_character_item(target_character uuid,target_item uuid,item_quantity integer default 1)
returns uuid language plpgsql security definer set search_path=public as $$
declare item campaign_items%rowtype; result_id uuid;
begin
  if auth.uid() is null or not public.is_character_gm(target_character) then raise exception 'Somente o mestre pode entregar itens.'; end if;
  if item_quantity < 1 then raise exception 'A quantidade deve ser maior que zero.'; end if;
  select * into item from campaign_items where id=target_item and campaign_id=(select campaign_id from campaign_characters where id=target_character) and archived=false;
  if item.id is null then raise exception 'Item não encontrado nesta campanha.'; end if;
  insert into character_inventory(character_id,item_id,item_snapshot,quantity)
  values(target_character,item.id,to_jsonb(item),item_quantity)
  on conflict(character_id,item_id) do update set quantity=character_inventory.quantity+excluded.quantity
  returning id into result_id;
  return result_id;
end; $$;

alter table public.campaign_characters enable row level security;
alter table public.character_invites enable row level security;
alter table public.campaign_items enable row level security;
alter table public.character_inventory enable row level security;

drop policy if exists "character visible to owner and assigned player" on public.campaign_characters;
create policy "character visible to owner and assigned player" on public.campaign_characters for select using (public.is_campaign_member(campaign_id) and (exists(select 1 from campaigns p where p.id=campaign_id and p.owner_id=auth.uid()) or assigned_user_id=auth.uid()));
drop policy if exists "gm manages characters" on public.campaign_characters;
create policy "gm manages characters" on public.campaign_characters for all using (exists(select 1 from campaigns p where p.id=campaign_id and p.owner_id=auth.uid())) with check (exists(select 1 from campaigns p where p.id=campaign_id and p.owner_id=auth.uid()));
drop policy if exists "gm manages invites" on public.character_invites;
create policy "gm manages invites" on public.character_invites for all using (exists(select 1 from campaign_characters c join campaigns p on p.id=c.campaign_id where c.id=character_id and p.owner_id=auth.uid())) with check (exists(select 1 from campaign_characters c join campaigns p on p.id=c.campaign_id where c.id=character_id and p.owner_id=auth.uid()));
drop policy if exists "members read item definitions" on public.campaign_items;
create policy "members read item definitions" on public.campaign_items for select using (public.is_campaign_member(campaign_id));
drop policy if exists "gm manages item library" on public.campaign_items;
create policy "gm manages item library" on public.campaign_items for all using (exists(select 1 from campaigns p where p.id=campaign_id and p.owner_id=auth.uid())) with check (exists(select 1 from campaigns p where p.id=campaign_id and p.owner_id=auth.uid()));
drop policy if exists "inventory visible to gm and assigned player" on public.character_inventory;
create policy "inventory visible to gm and assigned player" on public.character_inventory for select using (public.is_character_gm(character_id) or public.is_character_owner(character_id));
drop policy if exists "assigned player updates own inventory" on public.character_inventory;
create policy "assigned player updates own inventory" on public.character_inventory for update using (public.is_character_owner(character_id)) with check (public.is_character_owner(character_id));
drop policy if exists "gm manages inventory" on public.character_inventory;
create policy "gm manages inventory" on public.character_inventory for all using (public.is_character_gm(character_id)) with check (public.is_character_gm(character_id));

grant select,insert,update,delete on public.campaign_characters,public.character_invites,public.campaign_items,public.character_inventory to authenticated;
grant execute on function public.create_character_invite(uuid) to authenticated;
grant execute on function public.accept_character_invite(text) to authenticated;
grant execute on function public.grant_character_item(uuid,uuid,integer) to authenticated;
drop policy if exists "assigned player removes own inventory items" on public.character_inventory;
create policy "assigned player removes own inventory items" on public.character_inventory for delete using (public.is_character_owner(character_id));

do $$ begin
  alter publication supabase_realtime add table public.campaign_characters;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.campaign_items;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.character_inventory;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- A coleção antiga de fichas era um documento compartilhado com todos os membros.
-- Restringe esse documento legado ao mestre; as fichas individuais novas usam campaign_characters.
drop policy if exists "members can read campaign documents" on public.campaign_documents;
create policy "members read campaign documents except private sheets" on public.campaign_documents for select
using (public.is_campaign_member(campaign_id) and (document_key <> 'character-sheets-v1' or exists(select 1 from public.campaigns p where p.id=campaign_id and p.owner_id=auth.uid())));
drop policy if exists "members can insert campaign documents" on public.campaign_documents;
create policy "members insert allowed campaign documents" on public.campaign_documents for insert
with check (public.is_campaign_member(campaign_id) and updated_by=auth.uid() and (document_key <> 'character-sheets-v1' or exists(select 1 from public.campaigns p where p.id=campaign_id and p.owner_id=auth.uid())));
drop policy if exists "members can update campaign documents" on public.campaign_documents;
create policy "members update allowed campaign documents" on public.campaign_documents for update
using (public.is_campaign_member(campaign_id) and (document_key <> 'character-sheets-v1' or exists(select 1 from public.campaigns p where p.id=campaign_id and p.owner_id=auth.uid())))
with check (public.is_campaign_member(campaign_id) and updated_by=auth.uid() and (document_key <> 'character-sheets-v1' or exists(select 1 from public.campaigns p where p.id=campaign_id and p.owner_id=auth.uid())));
