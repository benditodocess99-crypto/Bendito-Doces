-- =====================================================================
-- Bendito · 03 · Notificação no celular/PC da loja quando chega pedido (push, mesmo com o painel fechado)
-- A chave privada VAPID NÃO fica aqui (repositório público): ela é gravada direto no banco, em config_privada.
-- =====================================================================
create extension if not exists pg_net;

-- configuração secreta (ninguém do app lê; só a função de envio, com a chave de serviço)
create table if not exists public.config_privada (
  chave text primary key,
  valor text not null
);
alter table public.config_privada enable row level security;
revoke all on public.config_privada from anon, authenticated;

-- aparelhos da equipe que recebem notificação (1 linha por navegador/celular)
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from anon;
drop policy if exists push_ver_seus on public.push_inscricoes;
create policy push_ver_seus on public.push_inscricoes for select to authenticated using (user_id = auth.uid());

create or replace function public.salvar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe() then raise exception 'Somente a equipe.'; end if;
  insert into public.push_inscricoes (user_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_aparelho, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho;
end $$;

create or replace function public.remover_inscricao_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.salvar_inscricao_push(text, text, text, text) from anon;
revoke execute on function public.remover_inscricao_push(text) from anon;
grant execute on function public.salvar_inscricao_push(text, text, text, text) to authenticated;
grant execute on function public.remover_inscricao_push(text) to authenticated;

-- controle pra não notificar duas vezes o mesmo pedido
alter table public.pedidos add column if not exists push_enviado boolean not null default false;

-- o gatilho agora chama a função para TODO pedido novo (push da loja) e para mudanças de status (WhatsApp do cliente)
create or replace function public.tg_pedido_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform net.http_post(
      url := 'https://suqtsngtnhnsfghntcwt.supabase.co/functions/v1/whatsapp-pedido',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return new;
end $$;
