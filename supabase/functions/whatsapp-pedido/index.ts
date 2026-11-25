// Bendito · envia as mensagens automáticas do pedido pelo WhatsApp oficial (Meta)
// Chamado pelo banco (gatilho) sempre que um pedido é criado ou muda de status.
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v25.0";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1467666003096863";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") ?? "2773107789773793";
const TOKEN = (Deno.env.get("WHATSAPP_TOKEN") ?? "").replace(/\s+/g, "").replace(/^["']+|["']+$/g, "").replace(/^Bearer/i, "");
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Modelos de mensagem (precisam ser aprovados pela Meta antes de enviar)
const MODELOS: { name: string; text: string; ex: string[] }[] = [
  { name: "bendito_pedido_recebido", text: "Olá, {{1}}! Recebemos seu pedido #{{2}} na Bendito Doces e Salgados. Total: {{3}}. Vamos te avisar por aqui a cada etapa.", ex: ["Ana", "1042", "R$ 32,00"] },
  { name: "bendito_pedido_aceito", text: "Seu pedido #{{1}} foi aceito e já está sendo preparado. Tempo estimado: {{2}}. Obrigado pela preferência!", ex: ["1042", "30 a 45 min"] },
  { name: "bendito_pedido_pronto", text: "Seu pedido #{{1}} está pronto! {{2}} Qualquer dúvida, é só responder esta mensagem.", ex: ["1042", "Pode vir retirar na loja."] },
  { name: "bendito_pedido_saiu", text: "Seu pedido #{{1}} saiu para entrega e já está a caminho. Obrigado por escolher a Bendito!", ex: ["1042"] },
  { name: "bendito_pedido_entregue", text: "Pedido #{{1}} concluído. Obrigado por escolher a Bendito Doces e Salgados, volte sempre!", ex: ["1042"] },
  { name: "bendito_pedido_recusado", text: "Infelizmente não conseguimos atender o pedido #{{1}}. Motivo: {{2}}. Pedimos desculpas, fale com a gente por aqui.", ex: ["1042", "produto esgotado"] },
];

const brl = (v: number) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function graph(path: string, body?: unknown) {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!TOKEN) return json({ erro: "WHATSAPP_TOKEN não configurado" }, 500);
  const corpo = await req.json().catch(() => ({}));

  // ---- utilitários de configuração (rodados uma vez) ----
  if (corpo.acao === "diag") {
    return json({ tamanho: TOKEN.length, comeca_com_EAA: TOKEN.startsWith("EAA"), so_letras_numeros: /^[A-Za-z0-9]+$/.test(TOKEN) });
  }
  if (corpo.acao === "criar_modelos") {
    const res = [];
    for (const m of MODELOS) {
      const r = await graph(`${WABA_ID}/message_templates`, {
        name: m.name, language: "pt_BR", category: "UTILITY",
        components: [{ type: "BODY", text: m.text, example: { body_text: [m.ex] } }],
      });
      res.push({ modelo: m.name, ok: r.ok, resposta: r.data });
    }
    return json(res);
  }
  if (corpo.acao === "status_modelos") {
    const r = await graph(`${WABA_ID}/message_templates?fields=name,status,rejected_reason&limit=50`);
    return json(r.data);
  }

  // ---- mensagem do pedido ----
  const id = String(corpo.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ erro: "id inválido" }, 400);
  const { data: p, error } = await sb.from("pedidos").select("*").eq("id", id).single();
  if (error || !p) return json({ erro: "pedido não encontrado" }, 404);
  if (!p.cliente_whatsapp) return json({ pulado: "sem whatsapp" });
  const enviados: string[] = p.wa_enviado ?? [];
  if (enviados.includes(p.status)) return json({ pulado: "já enviado" });

  const { data: loja } = await sb.from("loja").select("tempo_entrega,tempo_retirada").eq("id", 1).single();
  const n = String(p.numero);
  const primeiroNome = String(p.cliente_nome).trim().split(/\s+/)[0] || "cliente";
  let modelo = "";
  let vars: string[] = [];
  switch (p.status) {
    case "analise": modelo = "bendito_pedido_recebido"; vars = [primeiroNome, n, brl(p.total)]; break;
    case "preparo": modelo = "bendito_pedido_aceito"; vars = [n, (p.tipo === "entrega" ? loja?.tempo_entrega : loja?.tempo_retirada) ?? "alguns minutos"]; break;
    case "pronto":
      modelo = "bendito_pedido_pronto";
      vars = [n, p.tipo === "entrega" ? "Já vai sair para entrega." : p.tipo === "mesa" ? "Já estamos levando até a sua mesa." : "Pode vir retirar na loja."];
      break;
    case "entrega": modelo = "bendito_pedido_saiu"; vars = [n]; break;
    case "final": modelo = "bendito_pedido_entregue"; vars = [n]; break;
    case "recusado": modelo = "bendito_pedido_recusado"; vars = [n, (p.motivo_recusa || "indisponibilidade no momento").replace(/[\n\t]+/g, " ").slice(0, 200)]; break;
    default: return json({ pulado: "status sem mensagem" });
  }

  const r = await graph(`${PHONE_ID}/messages`, {
    messaging_product: "whatsapp",
    to: String(p.cliente_whatsapp).replace(/\D/g, ""),
    type: "template",
    template: { name: modelo, language: { code: "pt_BR" }, components: [{ type: "body", parameters: vars.map((t) => ({ type: "text", text: t })) }] },
  });

  await sb.from("pedidos").update({
    wa_enviado: r.ok ? [...enviados, p.status] : enviados,
    wa_erro: r.ok ? null : JSON.stringify(r.data).slice(0, 500),
  }).eq("id", id);

  return json({ ok: r.ok, modelo, resposta: r.data }, r.ok ? 200 : 502);
});
