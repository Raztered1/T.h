-- Central de Mestragem D&D v0.7.1 — atribuição segura de fichas
-- Execute uma única vez no Supabase SQL Editor, depois de aplicar schema.sql e username-auth.sql.

create or replace function public.is_campaign_owner(target_campaign uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.campaigns c where c.id=target_campaign and c.owner_id=auth.uid());
$$;

grant execute on function public.is_campaign_owner(uuid) to authenticated;

create table if not exists public.campaign_characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null default 'Novo personagem',
  data jsonb not null default '{}'::jsonb,
  assigned_user_id uuid references auth.users(id) on delete set null,
  permission_mode text not null default 'limited' check (permission_mode in ('limited','full','readonly')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaign_characters_campaign_idx on public.campaign_characters(campaign_id);
create index if not exists campaign_characters_assigned_idx on public.campaign_characters(assigned_user_id);

alter table public.campaign_characters enable row level security;
drop policy if exists "campaign owner manages characters" on public.campaign_characters;
drop policy if exists "assigned player reads own character" on public.campaign_characters;
create policy "campaign owner manages characters" on public.campaign_characters
  for all using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));
create policy "assigned player reads own character" on public.campaign_characters
  for select using (assigned_user_id=auth.uid() and public.is_campaign_member(campaign_id));
grant select, insert, update, delete on public.campaign_characters to authenticated;

-- O mestre pode consultar a lista de participantes com os nomes de usuário,
-- sem expor a tabela privada username_accounts ao navegador.
create or replace function public.list_campaign_players(target_campaign uuid)
returns table(user_id uuid, username text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_campaign_owner(target_campaign) then
    raise exception 'Somente o mestre pode consultar os jogadores desta campanha.';
  end if;
  return query
    select m.user_id, coalesce(a.username, 'Jogador')
    from public.campaign_members m
    left join public.username_accounts a on a.auth_user_id=m.user_id
    where m.campaign_id=target_campaign and m.role='member'
    order by a.username nulls last;
end; $$;
grant execute on function public.list_campaign_players(uuid) to authenticated;

-- Jogadores não fazem UPDATE direto. Esta função aceita apenas os campos
-- autorizados e verifica a atribuição e o nível de permissão no servidor.
create or replace function public.player_update_character(target_character uuid, changes jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare current_row public.campaign_characters%rowtype;
declare allowed_keys text[] := array['hp','tempHp','resources','spellSlots','consumables'];
declare incoming_keys text[];
begin
  select * into current_row from public.campaign_characters where id=target_character for update;
  if not found or current_row.assigned_user_id is distinct from auth.uid() then
    raise exception 'Esta ficha não está atribuída à sua conta.';
  end if;
  if current_row.permission_mode='readonly' then
    raise exception 'O mestre deixou esta ficha em modo somente leitura.';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'object' then raise exception 'Alterações inválidas.'; end if;
  select array_agg(k.key) into incoming_keys from jsonb_object_keys(changes) as k(key);
  if current_row.permission_mode='limited' and exists(select 1 from unnest(coalesce(incoming_keys, array[]::text[])) as incoming(key) where not (incoming.key=any(allowed_keys))) then
    raise exception 'Seu nível de acesso não permite alterar esses campos.';
  end if;
  update public.campaign_characters
  set data=data || changes,
      name=case when current_row.permission_mode='full' then coalesce(nullif(changes->>'name',''),name) else name end,
      updated_by=auth.uid(), updated_at=now()
  where id=target_character;
end; $$;
grant execute on function public.player_update_character(uuid,jsonb) to authenticated;

-- A lista de participantes é visível aos membros conforme a política já existente;
-- as fichas, porém, ficam restritas ao mestre e ao jogador atribuído.

do $$ begin
  alter publication supabase_realtime add table public.campaign_characters;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.campaign_members;
exception when duplicate_object then null;
end $$;

-- Protege os documentos antigos: apenas o mestre pode ler/alterar a ficha legada
-- e o Escudo do Mestre. Os documentos públicos de mapa continuam visíveis aos membros.
drop policy if exists "members can read campaign documents" on public.campaign_documents;
drop policy if exists "members can insert campaign documents" on public.campaign_documents;
drop policy if exists "members can update campaign documents" on public.campaign_documents;
create policy "campaign documents readable by role" on public.campaign_documents
  for select using (
    public.is_campaign_owner(campaign_id)
    or (public.is_campaign_member(campaign_id) and document_key not in ('master-shield','character-sheets-v1'))
  );
create policy "campaign owner inserts documents" on public.campaign_documents
  for insert with check (public.is_campaign_owner(campaign_id) and updated_by=auth.uid());
create policy "campaign owner updates documents" on public.campaign_documents
  for update using (public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_owner(campaign_id) and updated_by=auth.uid());
