-- =====================================================================
-- Bendito · 04 · Fechamento de caixa (conferência no fim do dia)
-- =====================================================================
create table if not exists public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  pedidos int not null default 0,
  faturamento numeric(10,2) not null default 0,
  sistema jsonb not null default '{}',   -- {pix, cartao, dinheiro, taxas, a_cobrar}  (calculado pelos pedidos)
  contado jsonb not null default '{}',   -- {pix, cartao, dinheiro}  (o que a loja conferiu de verdade)
  diferenca numeric(10,2) not null default 0,
  observacao text,
  fechado_por uuid references auth.users(id),
  fechado_em timestamptz not null default now()
);
alter table public.fechamentos enable row level security;
drop policy if exists fechamentos_equipe on public.fechamentos;
create policy fechamentos_equipe on public.fechamentos for all using (public.eh_equipe()) with check (public.eh_equipe());
grant select, insert, update, delete on public.fechamentos to authenticated;
revoke all on public.fechamentos from anon;
