-- Bendito · WhatsApp oficial: dispara a função whatsapp-pedido quando um pedido é criado ou muda de status
alter table public.pedidos add column if not exists wa_enviado text[] not null default '{}';
alter table public.pedidos add column if not exists wa_erro text;

create extension if not exists pg_net;

create or replace function public.tg_pedido_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_whatsapp is not null and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    perform net.http_post(
      url := 'https://suqtsngtnhnsfghntcwt.supabase.co/functions/v1/whatsapp-pedido',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return new;
end $$;

drop trigger if exists pedido_whatsapp on public.pedidos;
create trigger pedido_whatsapp after insert or update of status on public.pedidos
  for each row execute function public.tg_pedido_whatsapp();
