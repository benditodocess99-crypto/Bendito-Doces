# Bendito — Cardápio + Painel de pedidos

- **Cardápio do cliente** (`/`): o cliente escolhe, finaliza e acompanha o pedido em tempo real.
- **Painel da loja** (`/painel`): pedidos chegam na hora (com som), colunas Em análise → Em preparo → Pronto → Em entrega → Finalizados; produtos (liga/desliga, preço, foto, opções); configurações da loja; links e QR Code das mesas.

Links do cardápio (cada um marca a origem no painel):
- Instagram (bio): `https://SEU-SITE/?o=ig`
- WhatsApp: `https://SEU-SITE/?o=wa`
- Mesa: `https://SEU-SITE/?mesa=5` (o painel imprime os QR Codes de todas as mesas)

---

## 1. Banco de dados (Supabase) — só uma vez
1. Crie um projeto em https://supabase.com (de preferência numa conta da Bendito).
2. **SQL Editor > New query**: cole todo o arquivo `sql/01_banco_bendito.sql` e clique **Run**.
   Ele cria as tabelas, a segurança, o tempo real, a pasta de fotos e já cadastra o cardápio inicial.
3. **Authentication > Users > Add user > Create new user**: e-mail e senha da loja, marque **Auto Confirm User**.
4. Volte no **SQL Editor** e rode (trocando o e-mail):
   ```sql
   insert into public.equipe (user_id, nome)
   select id, 'Bendito' from auth.users where email = 'EMAIL-DA-LOJA@gmail.com';
   ```
5. **Authentication > Sign In / Providers > Email**: desligue **Allow new users to sign up**
   (assim ninguém cria conta sozinho; a equipe é só quem você liberar no passo 4).

## 2. Rodar no seu PC
1. Abra esta pasta no VSCode.
2. Copie `.env.example`, renomeie a cópia para `.env` e preencha com os dados de
   **Supabase > Project Settings > API** (Project URL e a chave **anon public**).
3. No terminal:
   ```
   npm install
   npm run dev
   ```
4. Abra:
   - Cardápio: http://localhost:5173
   - Painel: http://localhost:5173/painel/ (e-mail e senha do passo 1.3)

## 3. Publicar (Cloudflare Pages)
1. Cloudflare > **Workers & Pages > Create > Pages > Connect to Git** e escolha este repositório.
2. Framework: **Vite** · Build command: `npm run build` · Output: `dist`
3. **Environment variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (os mesmos do `.env`).
4. Endereços: `https://SEU-PROJETO.pages.dev` (cliente) e `https://SEU-PROJETO.pages.dev/painel/` (loja).

## Dicas de uso
- **Som no painel**: o navegador só deixa tocar som depois de um clique. Ao abrir o painel, toque uma vez na faixa dourada.
  Enquanto tiver pedido em "Em análise", o alarme repete a cada 15 s.
- **Acabou um produto**: aba Produtos > desligue o interruptor. Volta na hora quando ligar de novo.
- **Fechar a loja**: aba Loja > botão verde/vermelho no topo.
- **Imprimir pedido**: ícone 🖨️ no cartão (funciona com impressora térmica configurada no Windows, papel 80 mm).
- **Pago / A cobrar**: clique na etiqueta de pagamento do cartão para marcar.
- Fotos: troque as fotos iniciais pelas fotos reais em Produtos > Editar > foto (o sistema reduz o tamanho sozinho).

## Próxima fase
- Pagamento online (Pix/cartão) com aprovação automática.
- WhatsApp oficial (Meta): mensagem automática de "pedido recebido / pagamento aprovado / saiu pra entrega".
