import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, num, type Pedido, type StatusPedido } from '../../lib/supabase'
import { brl, foneBonito, haQuanto, hora, liberarSom, tocar, ORIGEM, PAGAMENTO, erroMsg } from '../../lib/util'
import { ativarPush, desligarPush, testarPush, verificarPush, temNotificacao, type EstadoPush } from '../../lib/push'

const COLUNAS: { st: StatusPedido; nome: string; cor: string; fundo: string }[] = [
  { st: 'analise', nome: 'Em análise', cor: 'text-c1', fundo: 'bg-c1b' },
  { st: 'preparo', nome: 'Em preparo', cor: 'text-c2', fundo: 'bg-c2b' },
  { st: 'pronto', nome: 'Pronto', cor: 'text-c3', fundo: 'bg-c3b' },
  { st: 'entrega', nome: 'Em entrega', cor: 'text-c4', fundo: 'bg-c4b' },
  { st: 'final', nome: 'Finalizados', cor: 'text-tinta', fundo: 'bg-[#ECEDEB]' },
]
const BOLINHA: Record<string, string> = { analise: 'bg-c1', preparo: 'bg-c2', pronto: 'bg-c3', entrega: 'bg-c4', final: 'bg-tinta' }

function normalizar(p: Pedido): Pedido {
  return {
    ...p,
    subtotal: num(p.subtotal),
    taxa: num(p.taxa),
    total: num(p.total),
    troco_para: p.troco_para == null ? null : num(p.troco_para),
    itens: (Array.isArray(p.itens) ? p.itens : []).map((i) => ({ ...i, preco: num(i.preco), qtd: num(i.qtd) })),
  }
}

function inicioDoDia() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [som, setSom] = useState(() => localStorage.getItem('bendito_som') !== 'off')
  const [somLiberado, setSomLiberado] = useState(false)
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState('')
  const [agora, setAgora] = useState(Date.now())
  const [imprimir, setImprimir] = useState<Pedido | null>(null)
  const [conexao, setConexao] = useState<'ok' | 'caiu'>('ok')
  const somRef = useRef(som)
  somRef.current = som
  const [push, setPush] = useState<EstadoPush>('verificando')
  const pushRef = useRef(push)
  pushRef.current = push

  useEffect(() => {
    verificarPush().then(setPush)
  }, [])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .or(`criado_em.gte.${inicioDoDia()},status.in.(analise,preparo,pronto,entrega)`)
      .order('criado_em', { ascending: true })
      .limit(500)
    if (error) setErro(erroMsg(error))
    else {
      setErro('')
      setPedidos((data as Pedido[]).map(normalizar))
    }
    setCarregando(false)
  }, [])

  // carga inicial + tempo real
  useEffect(() => {
    void carregar()
    const canal = supabase
      .channel('pedidos-painel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (msg) => {
        const novo = normalizar(msg.new as Pedido)
        setPedidos((ps) => (ps.some((p) => p.id === novo.id) ? ps : [...ps, novo]))
        if (somRef.current) tocar([988, 1319, 988])
        mostrar(`🔔 Novo pedido #${novo.numero} · ${brl(novo.total)}`)
        // aba em segundo plano e sem push ativo: mostra aviso do navegador
        if (document.hidden && pushRef.current !== 'ativo' && temNotificacao() && Notification.permission === 'granted') {
          try {
            new Notification(`🔔 Novo pedido #${novo.numero} · ${brl(novo.total)}`, { body: novo.cliente_nome, icon: '/icone-192.png', tag: 'pedido-' + novo.numero })
          } catch {
            /* alguns celulares só aceitam pelo service worker */
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, (msg) => {
        const at = normalizar(msg.new as Pedido)
        setPedidos((ps) => ps.map((p) => (p.id === at.id ? at : p)))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConexao('ok')
          void carregar() // pega o que chegou enquanto estava desconectado
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConexao('caiu')
      })
    // rede de segurança: recarrega a cada 60s
    const t = window.setInterval(() => void carregar(), 60000)
    return () => {
      window.clearInterval(t)
      void supabase.removeChannel(canal)
    }
  }, [carregar])

  // relógio dos "há X min"
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30000)
    return () => window.clearInterval(t)
  }, [])

  // alarme: enquanto tiver pedido em análise, toca a cada 15s
  const emAnalise = pedidos.filter((p) => p.status === 'analise').length
  useEffect(() => {
    document.title = emAnalise ? `(${emAnalise}) Novo pedido! · Bendito` : 'Bendito · Painel'
    if (!emAnalise) return
    const t = window.setInterval(() => {
      if (somRef.current) tocar([988, 1319])
    }, 15000)
    return () => window.clearInterval(t)
  }, [emAnalise])

  function mostrar(t: string) {
    setAviso(t)
    window.setTimeout(() => setAviso((a) => (a === t ? '' : a)), 3500)
  }

  async function mudar(p: Pedido, status: StatusPedido, extra: Partial<Pedido> = {}) {
    const antes = pedidos
    setPedidos((ps) => ps.map((x) => (x.id === p.id ? { ...x, status, ...extra } : x)))
    const { error } = await supabase.from('pedidos').update({ status, ...extra }).eq('id', p.id)
    if (error) {
      setPedidos(antes)
      mostrar('⚠️ Não salvou: ' + erroMsg(error))
    }
  }

  async function marcarPago(p: Pedido) {
    setPedidos((ps) => ps.map((x) => (x.id === p.id ? { ...x, pago: !p.pago } : x)))
    const { error } = await supabase.from('pedidos').update({ pago: !p.pago }).eq('id', p.id)
    if (error) mostrar('⚠️ Não salvou: ' + erroMsg(error))
  }

  function recusar(p: Pedido) {
    const motivo = window.prompt(`Recusar o pedido #${p.numero}? Escreva o motivo (o cliente vê):`, 'Produto esgotado')
    if (motivo === null) return
    void mudar(p, 'recusado', { motivo_recusa: motivo.trim() || null })
  }

  function imprimirPedido(p: Pedido) {
    setImprimir(p)
    window.setTimeout(() => window.print(), 80)
  }

  const q = busca.trim().toLowerCase()
  const visiveis = pedidos.filter((p) => {
    if (!q) return true
    return String(p.numero).includes(q) || p.cliente_nome.toLowerCase().includes(q) || (p.cliente_whatsapp ?? '').includes(q.replace(/\D/g, '') || '§')
  })
  const hoje = pedidos.filter((p) => p.criado_em >= inicioDoDia() && p.status !== 'recusado')
  const faturamento = hoje.reduce((a, p) => a + p.total, 0)

  return (
    <div className="relative flex h-full flex-col" onClick={() => { if (!somLiberado) { liberarSom(); setSomLiberado(true) } }}>
      {/* barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar (nome, telefone ou número)" className="min-w-0 flex-1 rounded-xl border border-borda bg-white px-3 py-2 text-[13px] outline-none sm:max-w-xs" />
        <div className="hidden text-right text-[11px] text-mudo sm:block">
          Hoje<b className="block text-sm text-tinta">{hoje.length} {hoje.length === 1 ? 'pedido' : 'pedidos'} · {brl(faturamento)}</b>
        </div>
        <span className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold ${conexao === 'ok' ? 'bg-c4b text-c4' : 'bg-c1b text-c1'}`}>
          <i className={`h-2 w-2 rounded-full ${conexao === 'ok' ? 'bg-c4 pulsar' : 'bg-c1'}`} />
          {conexao === 'ok' ? 'Ao vivo' : 'Reconectando…'}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            liberarSom()
            setSomLiberado(true)
            const n = !som
            setSom(n)
            localStorage.setItem('bendito_som', n ? 'on' : 'off')
            if (n) tocar([784, 1046])
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${som ? 'border-c4 bg-c4b text-c4' : 'border-borda bg-white text-mudo'}`}
        >
          {som ? '🔔 Som ligado' : '🔕 Som desligado'}
        </button>
      </div>
      {som && !somLiberado && (
        <button onClick={() => { liberarSom(); setSomLiberado(true); tocar([784, 1046]) }} className="mx-3 mt-2 rounded-xl bg-ouro px-3 py-2 text-left text-sm font-semibold text-white">
          👆 Toque aqui uma vez para liberar o som dos pedidos (o navegador exige)
        </button>
      )}
      <AvisoPush estado={push} setEstado={setPush} mostrar={mostrar} />
      {erro && <div className="mx-3 mt-2 rounded-xl bg-c1b p-2.5 text-sm text-c1">{erro}</div>}

      {/* colunas */}
      <div className="sem-barra flex min-h-0 flex-1 snap-x snap-mandatory gap-2.5 overflow-x-auto p-3 lg:grid lg:grid-cols-5 lg:overflow-x-visible">
        {COLUNAS.map((c) => {
          const lista = visiveis
            .filter((p) => p.status === c.st)
            .sort((a, b) => (c.st === 'final' ? b.atualizado_em.localeCompare(a.atualizado_em) : a.criado_em.localeCompare(b.criado_em)))
          const total = lista.reduce((a, p) => a + p.total, 0)
          return (
            <section key={c.st} className="flex min-h-0 w-[82vw] flex-none snap-start flex-col sm:w-72 lg:w-auto">
              <div className={`mb-2.5 rounded-xl border-[1.5px] px-3 py-2.5 ${c.fundo} ${c.st === 'analise' && lista.length ? 'border-c1' : 'border-transparent'}`}>
                <b className={`flex items-center gap-1.5 text-sm ${c.cor}`}>
                  {c.nome}
                  <i className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] not-italic text-white ${BOLINHA[c.st]}`}>{lista.length}</i>
                </b>
                <small className={`text-[11.5px] font-bold ${c.cor}`}>{brl(total)}</small>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-0.5">
                {carregando && <div className="rounded-xl border-[1.5px] border-dashed border-borda p-5 text-center text-xs text-[#b2b8b3]">Carregando…</div>}
                {!carregando && !lista.length && <div className="rounded-xl border-[1.5px] border-dashed border-borda p-5 text-center text-xs text-[#b2b8b3]">Nenhum pedido</div>}
                {lista.map((p) => (
                  <Cartao key={p.id} p={p} agora={agora} mudar={mudar} recusar={recusar} pago={marcarPago} imprimir={imprimirPedido} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {aviso && <div className="subir absolute left-1/2 top-3 z-30 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-tinta px-5 py-3 text-sm font-bold text-white shadow-xl">{aviso}</div>}
      {imprimir && <Recibo p={imprimir} />}
    </div>
  )
}

function AvisoPush({ estado, setEstado, mostrar }: { estado: EstadoPush; setEstado: (e: EstadoPush) => void; mostrar: (t: string) => void }) {
  const [ocupado, setOcupado] = useState(false)
  if (estado === 'verificando' || estado === 'sem_suporte') return null
  const caixa = 'mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm'
  if (estado === 'ativo')
    return (
      <div className={`${caixa} bg-c4b text-c4`}>
        <span className="flex-1 font-semibold">🔔 Notificações ativas neste aparelho (chegam mesmo com o painel fechado)</span>
        <button disabled={ocupado} onClick={async () => { setOcupado(true); const n = await testarPush(); setOcupado(false); mostrar(n ? '✓ Teste enviado' : '⚠️ Não consegui enviar o teste') }} className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold">Enviar teste</button>
        <button onClick={async () => { await desligarPush(); setEstado('inativo') }} className="text-xs font-semibold underline">Desligar</button>
      </div>
    )
  if (estado === 'instalar')
    return <div className={`${caixa} bg-c2b text-[#8a5a10]`}>📲 No iPhone: toque em <b>Compartilhar → Adicionar à Tela de Início</b>, abra o painel pelo ícone e ative as notificações.</div>
  if (estado === 'bloqueado')
    return <div className={`${caixa} bg-c1b text-c1`}>🔕 As notificações estão bloqueadas neste navegador. Libere no cadeado ao lado do endereço do site e recarregue.</div>
  return (
    <div className={`${caixa} bg-c3b text-c3`}>
      <span className="flex-1 font-semibold">Receba um aviso no celular/PC a cada pedido novo, mesmo com o painel fechado.</span>
      <button
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true)
          try {
            const e = await ativarPush()
            setEstado(e)
            if (e === 'ativo') mostrar('✓ Notificações ativadas')
          } catch (err) {
            mostrar('⚠️ ' + erroMsg(err))
          }
          setOcupado(false)
        }}
        className="rounded-lg bg-c3 px-3 py-1.5 text-xs font-bold text-white"
      >
        {ocupado ? 'Ativando…' : '🔔 Ativar notificações'}
      </button>
    </div>
  )
}

function Cartao({ p, agora, mudar, recusar, pago, imprimir }: {
  p: Pedido
  agora: number
  mudar: (p: Pedido, s: StatusPedido) => void
  recusar: (p: Pedido) => void
  pago: (p: Pedido) => void
  imprimir: (p: Pedido) => void
}) {
  const [aberto, setAberto] = useState(p.status === 'analise' || p.status === 'preparo')
  const local = p.tipo === 'entrega' ? `🛵 ${p.endereco ?? ''}` : p.tipo === 'mesa' ? `🪑 Mesa ${String(p.mesa ?? '').padStart(2, '0')}` : '🏪 Retirada no local'
  const origemCor = p.origem === 'whatsapp' ? 'bg-[#E3F7EA] text-[#138a43]' : p.origem === 'instagram' ? 'bg-[#FCE7F0] text-[#c13584]' : p.origem === 'mesa' ? 'bg-c2b text-c2' : 'bg-[#EEE] text-[#555]'
  const btn = 'flex-1 rounded-lg py-2 text-xs font-bold text-white'

  return (
    <article className={`subir mb-2.5 rounded-xl border bg-white p-2.5 text-xs ${p.status === 'analise' ? 'alerta border-c1' : 'border-borda'}`}>
      <div className="flex items-center justify-between gap-2">
        <b className="text-[15px] font-extrabold">#{p.numero}</b>
        <div className="flex items-center gap-1">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${origemCor}`}>{ORIGEM[p.origem] ?? p.origem}</span>
          <button onClick={() => imprimir(p)} title="Imprimir" className="rounded-md px-1 text-sm">🖨️</button>
        </div>
      </div>
      <div className="mt-0.5 text-[11px] font-semibold text-c1">{haQuanto(p.criado_em, agora)} · {hora(p.criado_em)}</div>
      <div className="mt-1.5 truncate font-bold">{p.cliente_nome}{p.cliente_whatsapp ? ` · ${foneBonito(p.cliente_whatsapp)}` : ''}</div>
      <div className="truncate text-[11px] text-mudo">{local}</div>

      <button onClick={() => setAberto((a) => !a)} className="mt-1 text-[11px] font-semibold text-c1">{aberto ? 'Ver menos ▴' : `Ver itens (${p.itens.reduce((a, i) => a + i.qtd, 0)}) ▾`}</button>
      {aberto && (
        <div className="mt-1 border-t border-dashed border-borda pt-1.5 text-[12px] leading-relaxed text-[#333]">
          {p.itens.map((i, k) => (
            <div key={k}>
              <b>{i.qtd}x</b> {i.nome}{i.opcao ? ` · ${i.opcao}` : ''}
              {i.obs && <span className="ml-1 rounded bg-[#FFF2C6] px-1 text-[10.5px] font-semibold text-[#6b5200]">{i.obs}</span>}
            </div>
          ))}
          {p.observacao && <div className="mt-1 rounded bg-[#FFF2C6] px-1.5 py-1 text-[11px] font-semibold text-[#6b5200]">📝 {p.observacao}</div>}
        </div>
      )}

      <div className="mt-2 flex items-end justify-between gap-1">
        <b className="whitespace-nowrap text-sm">{brl(p.total)}</b>
        <button onClick={() => pago(p)} title="Clique para marcar/desmarcar como pago" className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${p.pago ? 'bg-c4b text-c4' : 'bg-c1b text-c1'}`}>
          {PAGAMENTO[p.forma_pagamento]} · {p.pago ? 'Pago' : 'A cobrar'}
        </button>
      </div>
      {p.forma_pagamento === 'dinheiro' && p.troco_para ? <div className="mt-0.5 text-right text-[10.5px] text-mudo">Troco p/ {brl(p.troco_para)} ({brl(p.troco_para - p.total)})</div> : null}

      <div className="mt-2 flex gap-1.5">
        {p.status === 'analise' && (
          <>
            <button onClick={() => recusar(p)} className="rounded-lg border-[1.5px] border-c1 px-2.5 py-2 text-xs font-bold text-c1">Recusar</button>
            <button onClick={() => mudar(p, 'preparo')} className={`${btn} bg-c4`}>Aceitar</button>
          </>
        )}
        {p.status === 'preparo' && <button onClick={() => mudar(p, 'pronto')} className={`${btn} bg-c3`}>Pronto</button>}
        {p.status === 'pronto' && p.tipo === 'entrega' && <button onClick={() => mudar(p, 'entrega')} className={`${btn} bg-c2`}>🛵 Despachar</button>}
        {p.status === 'pronto' && p.tipo !== 'entrega' && <button onClick={() => mudar(p, 'final')} className={`${btn} bg-c4`}>Finalizar</button>}
        {p.status === 'entrega' && <button onClick={() => mudar(p, 'final')} className={`${btn} bg-c4`}>Finalizar</button>}
        {p.status === 'final' && <span className="text-[11px] font-semibold text-mudo">✓ Concluído às {hora(p.atualizado_em)}</span>}
        {(p.status === 'preparo' || p.status === 'pronto' || p.status === 'entrega') && (
          <button
            title="Voltar uma etapa"
            onClick={() => mudar(p, p.status === 'preparo' ? 'analise' : p.status === 'pronto' ? 'preparo' : 'pronto')}
            className="rounded-lg bg-fundo px-2.5 text-sm"
          >
            ↩
          </button>
        )}
      </div>
    </article>
  )
}

function Recibo({ p }: { p: Pedido }) {
  return (
    <div id="recibo" className="hidden print:block" style={{ fontFamily: 'monospace', fontSize: 12, color: '#000' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>BENDITO</div>
      <div style={{ textAlign: 'center' }}>Doces e Salgados</div>
      <hr />
      <div style={{ fontSize: 18, fontWeight: 700 }}>PEDIDO #{p.numero}</div>
      <div>{new Date(p.criado_em).toLocaleString('pt-BR')}</div>
      <div>{p.tipo === 'entrega' ? 'ENTREGA' : p.tipo === 'mesa' ? `MESA ${p.mesa}` : 'RETIRADA'}</div>
      <hr />
      <div>{p.cliente_nome}</div>
      {p.cliente_whatsapp && <div>{foneBonito(p.cliente_whatsapp)}</div>}
      {p.endereco && <div>{p.endereco}</div>}
      <hr />
      {p.itens.map((i, k) => (
        <div key={k}>
          {i.qtd}x {i.nome}{i.opcao ? ` (${i.opcao})` : ''} {brl(i.preco * i.qtd)}
          {i.obs && <div>  * {i.obs}</div>}
        </div>
      ))}
      {p.observacao && <div>OBS: {p.observacao}</div>}
      <hr />
      {p.taxa > 0 && <div>Taxa entrega: {brl(p.taxa)}</div>}
      <div style={{ fontWeight: 700, fontSize: 14 }}>TOTAL: {brl(p.total)}</div>
      <div>{PAGAMENTO[p.forma_pagamento]} · {p.pago ? 'PAGO' : 'A COBRAR'}</div>
      {p.troco_para ? <div>Troco para {brl(p.troco_para)}</div> : null}
    </div>
  )
}
