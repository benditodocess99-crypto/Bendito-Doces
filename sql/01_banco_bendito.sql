-- =====================================================================
-- Bendito · Banco v1 (cardápio do cliente + painel da loja)
-- Rode tudo de uma vez no Supabase: SQL Editor > New query > Run
-- Pode rodar de novo sem problema (não apaga nada).
-- =====================================================================

-- ---------- CONFIGURAÇÃO DA LOJA (uma linha só) ----------
create table if not exists public.loja (
  id int primary key default 1 check (id = 1),
  nome text not null default 'Bendito Doces e Salgados',
  endereco text default 'Av. Presidente Vargas, 212 · Bom Jesus - GO',
  whatsapp text default '5564992444300',
  aberto boolean not null default true,
  aceita_entrega boolean not null default true,
  aceita_retirada boolean not null default true,
  aceita_mesa boolean not null default true,
  mesas int not null default 12,
  taxa_entrega numeric(10,2) not null default 5,
  pedido_minimo numeric(10,2) not null default 15,
  tempo_entrega text not null default '30–45 min',
  tempo_retirada text not null default '15–20 min',
  aviso text
);
insert into public.loja (id) values (1) on conflict (id) do nothing;

-- ---------- EQUIPE (quem pode entrar no painel) ----------
create table if not exists public.equipe (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  criado_em timestamptz not null default now()
);

create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where user_id = auth.uid());
$$;

-- ---------- CARDÁPIO ----------
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  icone text,
  ordem int not null default 0,
  ativo boolean not null default true
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  preco_de numeric(10,2),              -- preço antigo (aparece riscado)
  foto_url text,
  opcoes jsonb not null default '[]',  -- [{"nome":"Fatia","extra":0},{"nome":"Inteiro","extra":56}]
  ativo boolean not null default true,
  destaque boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists produtos_categoria_idx on public.produtos(categoria_id);

-- ---------- PEDIDOS ----------
create sequence if not exists public.pedido_numero_seq start 1001;

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero int not null default nextval('public.pedido_numero_seq') unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  status text not null default 'analise'
    check (status in ('analise','preparo','pronto','entrega','final','recusado')),
  tipo text not null check (tipo in ('entrega','retirada','mesa')),
  mesa int,
  origem text not null default 'site',   -- whatsapp | instagram | mesa | site
  cliente_nome text not null,
  cliente_whatsapp text,
  endereco text,
  observacao text,
  itens jsonb not null,                  -- [{produto_id,nome,opcao,obs,qtd,preco}]
  subtotal numeric(10,2) not null,
  taxa numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  forma_pagamento text not null check (forma_pagamento in ('pix','cartao','dinheiro')),
  troco_para numeric(10,2),
  pago boolean not null default false,
  motivo_recusa text
);
create index if not exists pedidos_criado_idx on public.pedidos(criado_em desc);
create index if not exists pedidos_status_idx on public.pedidos(status);

create or replace function public.tg_pedido_atualizado()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists pedido_atualizado on public.pedidos;
create trigger pedido_atualizado before update on public.pedidos
  for each row execute function public.tg_pedido_atualizado();

-- ---------- SEGURANÇA (RLS) ----------
alter table public.loja enable row level security;
alter table public.equipe enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.pedidos enable row level security;

drop policy if exists loja_ler on public.loja;
create policy loja_ler on public.loja for select using (true);
drop policy if exists loja_editar on public.loja;
create policy loja_editar on public.loja for update using (public.eh_equipe()) with check (public.eh_equipe());

drop policy if exists equipe_ler on public.equipe;
create policy equipe_ler on public.equipe for select using (user_id = auth.uid() or public.eh_equipe());

drop policy if exists categorias_ler on public.categorias;
create policy categorias_ler on public.categorias for select using (ativo or public.eh_equipe());
drop policy if exists categorias_editar on public.categorias;
create policy categorias_editar on public.categorias for all using (public.eh_equipe()) with check (public.eh_equipe());

drop policy if exists produtos_ler on public.produtos;
create policy produtos_ler on public.produtos for select using (ativo or public.eh_equipe());
drop policy if exists produtos_editar on public.produtos;
create policy produtos_editar on public.produtos for all using (public.eh_equipe()) with check (public.eh_equipe());

-- pedidos: só a equipe lê/edita direto. O cliente cria e acompanha pelas funções abaixo.
drop policy if exists pedidos_equipe on public.pedidos;
create policy pedidos_equipe on public.pedidos for all using (public.eh_equipe()) with check (public.eh_equipe());

-- ---------- CRIAR PEDIDO (o cliente chama isso) ----------
-- O preço é SEMPRE recalculado aqui pelo banco, nunca confiamos no valor que vem do celular.
create or replace function public.criar_pedido(p jsonb)
returns table (id uuid, numero int)
language plpgsql security definer set search_path = public as $$
declare
  l public.loja%rowtype;
  v_tipo text := p->>'tipo';
  v_nome text := left(trim(coalesce(p->>'cliente_nome','')), 80);
  v_whats text := left(regexp_replace(coalesce(p->>'cliente_whatsapp',''), '\D', '', 'g'), 15);
  v_end text := left(trim(coalesce(p->>'endereco','')), 200);
  v_mesa int := nullif(p->>'mesa','')::int;
  v_pag text := p->>'forma_pagamento';
  v_origem text := coalesce(nullif(p->>'origem',''), 'site');
  it jsonb;
  prod public.produtos%rowtype;
  v_qtd int;
  v_opcao text;
  v_extra numeric;
  v_itens jsonb := '[]'::jsonb;
  v_sub numeric := 0;
  v_taxa numeric := 0;
  v_id uuid;
  v_num int;
begin
  select * into l from public.loja where loja.id = 1;
  if not l.aberto then raise exception 'A loja está fechada no momento.'; end if;
  if v_tipo not in ('entrega','retirada','mesa') then raise exception 'Tipo de pedido inválido.'; end if;
  if v_tipo = 'entrega' and not l.aceita_entrega then raise exception 'Entrega indisponível agora.'; end if;
  if v_tipo = 'retirada' and not l.aceita_retirada then raise exception 'Retirada indisponível agora.'; end if;
  if v_tipo = 'mesa' and (not l.aceita_mesa or v_mesa is null or v_mesa < 1 or v_mesa > l.mesas) then raise exception 'Mesa inválida.'; end if;
  if length(v_nome) < 2 then raise exception 'Informe seu nome.'; end if;
  if v_tipo <> 'mesa' and length(v_whats) < 10 then raise exception 'Informe um WhatsApp válido.'; end if;
  if v_tipo = 'entrega' and length(v_end) < 5 then raise exception 'Informe o endereço de entrega.'; end if;
  if v_pag not in ('pix','cartao','dinheiro') then raise exception 'Forma de pagamento inválida.'; end if;
  if v_origem not in ('whatsapp','instagram','mesa','site') then v_origem := 'site'; end if;
  if jsonb_typeof(p->'itens') <> 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'Sua sacola está vazia.'; end if;
  if jsonb_array_length(p->'itens') > 40 then raise exception 'Pedido grande demais.'; end if;

  for it in select * from jsonb_array_elements(p->'itens') loop
    select * into prod from public.produtos pr where pr.id = (it->>'produto_id')::uuid and pr.ativo;
    if not found then raise exception 'Um dos produtos não está mais disponível. Atualize a página.'; end if;
    v_qtd := greatest(1, least(50, coalesce((it->>'qtd')::int, 1)));
    v_opcao := nullif(it->>'opcao','');
    v_extra := 0;
    if v_opcao is not null then
      select coalesce((o->>'extra')::numeric, 0) into v_extra
        from jsonb_array_elements(prod.opcoes) o where o->>'nome' = v_opcao limit 1;
      if not found then raise exception 'Opção inválida em %.', prod.nome; end if;
    end if;
    v_itens := v_itens || jsonb_build_object(
      'produto_id', prod.id, 'nome', prod.nome, 'opcao', v_opcao,
      'obs', left(coalesce(it->>'obs',''), 120), 'qtd', v_qtd, 'preco', prod.preco + v_extra);
    v_sub := v_sub + (prod.preco + v_extra) * v_qtd;
  end loop;

  if v_tipo = 'entrega' then v_taxa := l.taxa_entrega; end if;
  if v_tipo <> 'mesa' and v_sub < l.pedido_minimo then
    raise exception 'O pedido mínimo é de R$ %.', replace(to_char(l.pedido_minimo, 'FM999990.00'), '.', ',');
  end if;

  insert into public.pedidos (tipo, mesa, origem, cliente_nome, cliente_whatsapp, endereco, observacao,
                              itens, subtotal, taxa, total, forma_pagamento, troco_para)
  values (v_tipo, case when v_tipo = 'mesa' then v_mesa end, v_origem, v_nome, nullif(v_whats,''),
          case when v_tipo = 'entrega' then v_end end, left(nullif(trim(p->>'observacao'),''), 300),
          v_itens, v_sub, v_taxa, v_sub + v_taxa, v_pag,
          case when v_pag = 'dinheiro' then nullif(p->>'troco_para','')::numeric end)
  returning pedidos.id, pedidos.numero into v_id, v_num;

  return query select v_id, v_num;
end $$;

-- ---------- ACOMPANHAR PEDIDO (o cliente chama isso com o id do pedido) ----------
create or replace function public.acompanhar_pedido(p_id uuid)
returns table (numero int, status text, tipo text, mesa int, total numeric, itens jsonb,
               forma_pagamento text, criado_em timestamptz, atualizado_em timestamptz, motivo_recusa text)
language sql stable security definer set search_path = public as $$
  select numero, status, tipo, mesa, total, itens, forma_pagamento, criado_em, atualizado_em, motivo_recusa
  from public.pedidos where id = p_id;
$$;

grant execute on function public.criar_pedido(jsonb) to anon, authenticated;
grant execute on function public.acompanhar_pedido(uuid) to anon, authenticated;
grant execute on function public.eh_equipe() to anon, authenticated;

-- ---------- TEMPO REAL (o painel recebe os pedidos na hora) ----------
do $$ begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null; end $$;

-- ---------- FOTOS DOS PRODUTOS ----------
insert into storage.buckets (id, name, public) values ('produtos', 'produtos', true)
on conflict (id) do nothing;

drop policy if exists produtos_fotos_ler on storage.objects;
create policy produtos_fotos_ler on storage.objects for select using (bucket_id = 'produtos');
drop policy if exists produtos_fotos_enviar on storage.objects;
create policy produtos_fotos_enviar on storage.objects for insert with check (bucket_id = 'produtos' and public.eh_equipe());
drop policy if exists produtos_fotos_trocar on storage.objects;
create policy produtos_fotos_trocar on storage.objects for update using (bucket_id = 'produtos' and public.eh_equipe());
drop policy if exists produtos_fotos_apagar on storage.objects;
create policy produtos_fotos_apagar on storage.objects for delete using (bucket_id = 'produtos' and public.eh_equipe());

-- ---------- CARDÁPIO INICIAL (só entra se ainda não tiver categoria nenhuma) ----------
do $$
declare s uuid; d uuid; pc uuid; c uuid; b uuid;
begin
  if exists (select 1 from public.categorias) then return; end if;
  insert into public.categorias (nome, icone, ordem) values ('Salgados','🥟',1) returning id into s;
  insert into public.categorias (nome, icone, ordem) values ('Doces','🍮',2) returning id into d;
  insert into public.categorias (nome, icone, ordem) values ('Pães na chapa','🍞',3) returning id into pc;
  insert into public.categorias (nome, icone, ordem) values ('Capuccinos e cafés','☕',4) returning id into c;
  insert into public.categorias (nome, icone, ordem) values ('Bebidas','🥤',5) returning id into b;

  insert into public.produtos (categoria_id, nome, descricao, preco, foto_url, opcoes, destaque, ordem) values
  (s,'Coxinha','Massa leve e crocante, recheio cremoso de frango.',7,'/produtos/salgados.jpg','[]',true,1),
  (s,'Quibe','Quibe tradicional bem temperado.',7,null,'[]',false,2),
  (s,'Presunto e mussarela','Massa dourada recheada com presunto e mussarela.',7,null,'[]',false,3),
  (s,'Enroladinho de salsicha','Clássico da casa, massa macia.',6.5,null,'[]',false,4),
  (s,'Torta salgada','Torta de frango cremosa com bacon e finalização da casa.',12,'/produtos/torta.jpg','[{"nome":"Fatia","extra":0},{"nome":"Inteira","extra":73}]',true,5),
  (d,'Pudim de leite','Lisinho, com calda de caramelo derramando.',9,'/produtos/pudim.jpg','[{"nome":"Fatia","extra":0},{"nome":"Inteiro","extra":56}]',true,1),
  (d,'Folhado de chocolate','Massa folhada amanteigada com creme de chocolate.',9,'/produtos/croissant.jpg','[]',true,2),
  (d,'Donut de doce de leite','Fofinho e recheado até transbordar.',10,'/produtos/donut.jpg','[]',true,3),
  (d,'Caixinha Bendito Kids','4 brigadeiros + mini livro de colorir + giz de cera.',22,'/produtos/brigadeiro.jpg','[]',false,4),
  (pc,'Pão na chapa','Pão francês na manteiga, dourado na chapa.',6,null,'[{"nome":"Tradicional","extra":0},{"nome":"Com queijo","extra":3},{"nome":"Com ovo","extra":5}]',false,1),
  (pc,'Misto quente','Presunto e queijo derretidos na chapa.',11,null,'[]',false,2),
  (c,'Capuccino tradicional','Cremoso, com canela e chocolate.',9,null,'[{"nome":"Médio","extra":0},{"nome":"Grande","extra":3}]',false,1),
  (c,'Capuccino de Nutella','Com Nutella de verdade e chantilly.',13,null,'[]',false,2),
  (c,'Café coado','Passado na hora.',4,null,'[]',false,3),
  (b,'Suco natural','Feito na hora.',9,null,'[{"nome":"Laranja","extra":0},{"nome":"Maracujá","extra":0},{"nome":"Abacaxi com hortelã","extra":0},{"nome":"Morango","extra":0}]',false,1),
  (b,'Refrigerante lata','Coca-Cola, Guaraná ou Fanta.',6,null,'[]',false,2),
  (b,'Água mineral','Com ou sem gás.',3.5,null,'[]',false,3);
end $$;

-- =====================================================================
-- DEPOIS DE RODAR: crie o usuário da loja em Authentication > Users > Add user
-- (e-mail + senha, marque "Auto Confirm"). Depois rode a linha abaixo trocando o e-mail:
--
--   insert into public.equipe (user_id, nome)
--   select id, 'Bendito' from auth.users where email = 'EMAIL-DA-LOJA@gmail.com';
-- =====================================================================
