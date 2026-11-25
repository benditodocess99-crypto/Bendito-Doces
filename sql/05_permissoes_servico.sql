-- Bendito · 05 · Projetos novos do Supabase não dão permissão automática à chave de serviço (usada pelas funções)
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
