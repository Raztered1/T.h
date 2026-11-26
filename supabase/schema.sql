-- Central de Mestragem D&D v0.7
create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,10)),
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);
create table if not exists public.campaign_documents (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  document_key text not null check (document_key in ('draft','published','master-shield','character-sheets-v1')),
  content jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(campaign_id,document_key)
);

create or replace function public.create_campaign(campaign_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para criar uma campanha.'; end if;
  insert into campaigns(name,owner_id) values (trim(campaign_name),auth.uid()) returning id into new_id;
  insert into campaign_members(campaign_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end; $$;

create or replace function public.join_campaign(invite_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare found_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para entrar em uma campanha.'; end if;
  select id into found_id from campaigns where campaigns.invite_code=upper(trim(join_campaign.invite_code));
  if found_id is null then raise exception 'Código de convite inválido.'; end if;
  insert into campaign_members(campaign_id,user_id,role) values(found_id,auth.uid(),'member') on conflict do nothing;
  return found_id;
end; $$;

create or replace function public.is_campaign_member(target_campaign uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.campaign_members m where m.campaign_id=target_campaign and m.user_id=auth.uid());
$$;

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_documents enable row level security;
create policy "campaign members can view campaigns" on public.campaigns for select using (public.is_campaign_member(id));
create policy "owner can update campaign" on public.campaigns for update using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "members can view membership" on public.campaign_members for select using (public.is_campaign_member(campaign_id));
create policy "members can read campaign documents" on public.campaign_documents for select using (public.is_campaign_member(campaign_id));
create policy "members can insert campaign documents" on public.campaign_documents for insert with check (public.is_campaign_member(campaign_id) and updated_by=auth.uid());
create policy "members can update campaign documents" on public.campaign_documents for update using (public.is_campaign_member(campaign_id)) with check (public.is_campaign_member(campaign_id) and updated_by=auth.uid());
grant execute on function public.create_campaign(text) to authenticated;
grant execute on function public.join_campaign(text) to authenticated;
grant select on public.campaigns,public.campaign_members,public.campaign_documents to authenticated;
grant insert,update on public.campaign_documents to authenticated;
alter publication supabase_realtime add table public.campaign_documents;
