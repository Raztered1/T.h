-- Execute este script UMA VEZ no Supabase SQL Editor.
-- A tabela é privada: somente a função segura do Netlify usa a chave service_role.
create table if not exists public.username_accounts (
  username text primary key check (username ~ '^[a-z0-9_]{3,20}$'),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  recovery_code_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.username_accounts enable row level security;
revoke all on table public.username_accounts from anon, authenticated;
-- Não crie políticas RLS para anon/authenticated nesta tabela.
