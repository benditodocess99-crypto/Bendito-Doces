import { useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { supabase, num, type Categoria, type FormaPagamento, type Loja, type Produto, type TipoPedido, type ItemPedido, type StatusPedido } from '../lib/supabase'
import { brl, mascaraFone, erroMsg, PAGAMENTO } from '../lib/util'

type ItemSacola = { chave: string; produto_id: string; nome: string; opcao: string | null; obs: string; qtd: number; preco: number; foto: string | null }
type Acompanhamento = {
  numero: number
  status: StatusPedido
  tipo: TipoPedido
  mesa: number | null
  total: number
  itens: ItemPedido[]
  forma_pagamento: FormaPagamento
  motivo_recusa: string | null
}

const params = new URLSearchParams(window.location.search)
const MESA = params.get('mesa') ? parseInt(params.get('mesa')!, 10) || null : null
const ORIGEM_URL = (() => {
  const o = (params.get('o') || params.get('origem') || '').toLowerCase()
  if (MESA) return 'mesa'
  if (o === 'wa' || o === 'whatsapp') return 'whatsapp'
  if (o === 'ig' || o === 'instagram') return 'instagram'
  return 'site'
})()
const TEL_URL = (params.get('tel') || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')

const K_SACOLA = 'bendito_sacola'
const K_DADOS = 'bendito_dados'
const K_PEDIDO = 'bendito_pedido'

function lerJSON<T>(k: string, padrao: T): T {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : padrao
  } catch {
    return padrao
  }
}

export default function Cardapio() {
  const [loja, setLoja] = useState<Loja | null>(null)
  const [cats, setCats] = useState<Categoria[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tela, setTela] = useState<'menu' | 'sacola' | 'pedido'>('menu')
  const [sacola, setSacola] = useState<ItemSacola[]>(() => lerJSON<ItemSacola[]>(K_SACOLA, []))
  const [aberto, setAberto] = useState<Produto | null>(null)
  const [catAtiva, setCatAtiva] = useState('')
  const [aviso, setAviso] = useState('')
  const [pedidoId, setPedidoId] = useState<string | null>(() => {
    const p = lerJSON<{ id: string; em: number } | null>(K_PEDIDO, null)
    return p && Date.now() - p.em < 8 * 3600 * 1000 ? p.id : null
  })

  useEffect(() => {
    ;(async () => {
      const [l, c, p] = await Promise.all([
        supabase.from('loja').select('*').eq('id', 1).single(),
        supabase.from('categorias').select('*').eq('ativo', true).order('ordem'),
        supabase.from('produtos').select('*').eq('ativo', true).order('ordem'),
      ])
      if (l.error || c.error || p.error) {
        setErro('Não foi possível carregar o cardápio. Verifique sua internet e tente de novo.')
      } else {
        setLoja({ ...(l.data as Loja), taxa_entrega: num(l.data.taxa_entrega), pedido_minimo: num(l.data.pedido_minimo) })
        setCats(c.data as Categoria[])
        setProds((p.data as Produto[]).map((x) => ({ ...x, preco: num(x.preco), preco_de: x.preco_de == null ? null : num(x.preco_de), opcoes: Array.isArray(x.opcoes) ? x.opcoes.map((o) => ({ nome: o.nome, extra: num(o.extra) })) : [] })))
      }
      setCarregando(false)
    })()
  }, [])

  useEffect(() => {
    localStorage.setItem(K_SACOLA, JSON.stringify(sacola))
  }, [sacola])

  function avisar(t: string) {
    setAviso(t)
    window.clearTimeout((avisar as unknown as { t?: number }).t)
    ;(avisar as unknown as { t?: number }).t = window.setTimeout(() => setAviso(''), 1800)
  }

  function adicionar(it: ItemSacola) {
    setSacola((s) => {
      const ex = s.find((x) => x.chave === it.chave)
      if (ex) return s.map((x) => (x.chave === it.chave ? { ...x, qtd: x.qtd + it.qtd } : x))
      return [...s, it]
    })
    avisar(`✓ ${it.nome} na sacola`)
  }

  function rapido(p: Produto) {
    if (p.opcoes.length) return setAberto(p)
    adicionar({ chave: p.id, produto_id: p.id, nome: p.nome, opcao: null, obs: '', qtd: 1, preco: p.preco, foto: p.foto_url })
  }

  const qtdTotal = sacola.reduce((a, i) => a + i.qtd, 0)
  const subtotal = sacola.reduce((a, i) => a + i.qtd * i.preco, 0)

  if (carregando) return <Centro><div className="h-8 w-8 rounded-full border-4 border-salvia border-t-verde girar" /></Centro>
  if (erro || !loja) return <Centro><p className="text-center text-mudo">{erro || 'Cardápio indisponível.'}</p></Centro>

  if (tela === 'pedido' && pedidoId)
    return <AcompanharPedido id={pedidoId} loja={loja} voltar={() => setTela('menu')} />

  if (tela === 'sacola')
    return (
      <Checkout
        loja={loja}
        sacola={sacola}
        setSacola={setSacola}
        voltar={() => setTela('menu')}
        concluido={(id) => {
          localStorage.setItem(K_PEDIDO, JSON.stringify({ id, em: Date.now() }))
          setPedidoId(id)
          setSacola([])
          setTela('pedido')
          window.scrollTo(0, 0)
        }}
      />
    )

  const destaques = prods.filter((p) => p.destaque && p.foto_url)

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-creme pb-32">
      {/* capa */}
      <div className="relative h-44">
        <img src="/capa.jpg" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
      </div>
      <div className="relative z-10 mx-4 -mt-10 rounded-3xl bg-papel p-4 shadow-[0_8px_24px_rgba(60,50,20,.1)]">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Bendito" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-ouro2" />
          <div className="min-w-0">
            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${loja.aberto ? 'bg-c4b text-c4' : 'bg-c1b text-c1'}`}>
              ● {loja.aberto ? 'Aberto agora' : 'Fechado no momento'}
            </span>
            <h1 className="font-serif text-3xl font-bold leading-none text-verde">Bendito</h1>
            <p className="truncate text-xs text-mudo">{loja.endereco}</p>
          </div>
        </div>
        {!MESA && (
          <div className="mt-3 flex border-t border-linha pt-3 text-center text-[11px] text-mudo">
            {loja.aceita_entrega && (
              <div className="flex-1"><b className="block text-[13px] text-tinta">{loja.tempo_entrega}</b>Entrega</div>
            )}
            {loja.aceita_entrega && (
              <div className="flex-1"><b className="block text-[13px] text-tinta">{brl(loja.taxa_entrega)}</b>Taxa</div>
            )}
            <div className="flex-1"><b className="block text-[13px] text-tinta">{brl(loja.pedido_minimo)}</b>Mínimo</div>
          </div>
        )}
      </div>

      {MESA && (
        <div className="mx-4 mt-3 rounded-2xl border border-dashed border-ouro2 bg-papel p-3 text-sm text-mudo">
          🪑 Você está na <b className="text-verde">Mesa {String(MESA).padStart(2, '0')}</b>. Escolha e envie: o pedido vai direto pra cozinha.
        </div>
      )}
      {loja.aviso && <div className="mx-4 mt-3 rounded-2xl bg-c2b p-3 text-sm text-[#8a5a10]">📣 {loja.aviso}</div>}
      {!loja.aberto && (
        <div className="mx-4 mt-3 rounded-2xl bg-c1b p-3 text-sm text-c1">A loja está fechada agora. Você pode ver o cardápio, mas os pedidos voltam quando abrirmos. 💚</div>
      )}
      {pedidoId && (
        <button onClick={() => setTela('pedido')} className="mx-4 mt-3 flex items-center justify-between self-stretch rounded-2xl bg-verde px-4 py-3 text-left text-white" style={{ width: 'calc(100% - 2rem)' }}>
          <span className="text-sm">📦 Acompanhar meu pedido</span>
          <span className="font-semibold">→</span>
        </button>
      )}

      {destaques.length > 0 && (
        <section className="pt-5">
          <h2 className="px-4 pb-2 font-serif text-2xl font-semibold text-verde">Mais pedidos</h2>
          <div className="sem-barra flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {destaques.map((p) => (
              <button key={p.id} onClick={() => setAberto(p)} className="w-40 flex-none snap-start overflow-hidden rounded-3xl bg-papel text-left shadow-[0_6px_20px_rgba(60,50,20,.07)]">
                <img src={p.foto_url!} alt="" className="h-36 w-full object-cover" />
                <div className="p-3">
                  <b className="block truncate text-sm">{p.nome}</b>
                  <span className="font-serif text-xl font-bold text-verde">{brl(p.preco)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* abas de categoria */}
      <nav className="sem-barra sticky top-0 z-20 mt-3 flex gap-2 overflow-x-auto bg-creme px-4 py-3">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setCatAtiva(c.id)
              document.getElementById('cat-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className={`flex-none rounded-full border px-4 py-2 text-[13px] font-semibold ${catAtiva === c.id ? 'border-verde bg-verde text-white' : 'border-linha bg-papel text-mudo'}`}
          >
            {c.icone} {c.nome}
          </button>
        ))}
      </nav>

      <div className="px-4">
        {cats.map((c) => {
          const lista = prods.filter((p) => p.categoria_id === c.id)
          if (!lista.length) return null
          return (
            <section key={c.id} id={'cat-' + c.id} className="scroll-mt-16">
              <h2 className="mb-2 mt-4 font-serif text-2xl font-semibold text-verde">{c.icone} {c.nome}</h2>
              {lista.map((p) => (
                <div key={p.id} onClick={() => setAberto(p)} className="mb-2.5 flex cursor-pointer items-center gap-3 rounded-[20px] bg-papel p-2.5">
                  <Foto p={p} className="h-20 w-20 flex-none rounded-2xl text-3xl" />
                  <div className="min-w-0 flex-1">
                    <b className="block text-[15px]">{p.nome}</b>
                    {p.descricao && <p className="line-clamp-2 text-xs leading-snug text-mudo">{p.descricao}</p>}
                    <div className="mt-1 flex items-baseline gap-2">
                      {p.preco_de != null && p.preco_de > p.preco && <s className="text-xs text-mudo">{brl(p.preco_de)}</s>}
                      {p.opcoes.length > 0 && <span className="text-[11px] text-mudo">a partir de</span>}
                      <span className="font-serif text-xl font-bold text-verde">{brl(p.preco)}</span>
                    </div>
                  </div>
                  <button
                    aria-label={`Adicionar ${p.nome}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      rapido(p)
                    }}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-verde text-xl text-white"
                  >
                    +
                  </button>
                </div>
              ))}
            </section>
          )
        })}
        <p className="py-8 text-center text-xs text-mudo">Bendito Doces e Salgados · Um lugar abençoado por Deus 💚</p>
      </div>

      {/* barra da sacola */}
      {qtdTotal > 0 && (
        <button onClick={() => { setTela('sacola'); window.scrollTo(0, 0) }} className="subir fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-[480px] items-center justify-between rounded-2xl bg-verde px-4 py-3.5 text-left text-white shadow-[0_10px_26px_rgba(30,74,51,.35)]">
          <span>
            <small className="block text-[11px] text-[#bcd3c2]">{qtdTotal} {qtdTotal === 1 ? 'item' : 'itens'}</small>
            <b>{brl(subtotal)}</b>
          </span>
          <span className="text-sm font-bold">Ver sacola →</span>
        </button>
      )}

      {aberto && <FolhaProduto p={aberto} fechar={() => setAberto(null)} adicionar={adicionar} />}

      {aviso && <div className="subir fixed left-1/2 top-4 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-4 py-2.5 text-sm text-white">{aviso}</div>}
    </div>
  )
}

function Centro({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-creme p-6">{children}</div>
}

function Foto({ p, className }: { p: { foto_url: string | null; nome: string }; className: string }) {
  if (p.foto_url) return <img src={p.foto_url} alt="" className={`object-cover ${className}`} />
  return <div className={`flex items-center justify-center bg-salvia ${className}`}>🍽️</div>
}

function FolhaProduto({ p, fechar, adicionar }: { p: Produto; fechar: () => void; adicionar: (i: ItemSacola) => void }) {
  const [op, setOp] = useState(0)
  const [qtd, setQtd] = useState(1)
  const [obs, setObs] = useState('')
  const opcao = p.opcoes[op] ?? null
  const unit = p.preco + (opcao ? opcao.extra : 0)

  return (
    <>
      <div onClick={fechar} className="fixed inset-0 z-40 bg-black/45" />
      <div className="subir fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-[28px] bg-creme">
        <div className="relative">
          {p.foto_url ? <img src={p.foto_url} alt="" className="h-60 w-full object-cover" /> : <div className="flex h-40 items-center justify-center bg-salvia text-7xl">🍽️</div>}
          <button onClick={fechar} aria-label="Fechar" className="absolute right-3 top-3 h-9 w-9 rounded-full bg-papel/90 text-lg">✕</button>
        </div>
        <div className="p-5 pb-8">
          <h2 className="font-serif text-3xl font-semibold leading-tight text-verde">{p.nome}</h2>
          {p.descricao && <p className="mb-3 mt-1 text-sm leading-relaxed text-mudo">{p.descricao}</p>}
          {p.opcoes.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {p.opcoes.map((o, i) => (
                <button key={o.nome} onClick={() => setOp(i)} className={`rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold ${i === op ? 'border-verde bg-[#EEF4EC] text-verde' : 'border-linha bg-papel'}`}>
                  {o.nome}{o.extra > 0 ? ` (+${brl(o.extra)})` : ''}
                </button>
              ))}
            </div>
          )}
          <input value={obs} onChange={(e) => setObs(e.target.value.slice(0, 120))} placeholder="Alguma observação? (ex: bem quente)" className="w-full rounded-xl border border-linha bg-papel px-3.5 py-3 text-[15px] outline-none focus:border-ouro" />
          <div className="mt-4 flex items-center gap-3">
            <Qtd valor={qtd} menos={() => setQtd((q) => Math.max(1, q - 1))} mais={() => setQtd((q) => Math.min(50, q + 1))} />
            <button
              onClick={() => {
                adicionar({ chave: `${p.id}|${opcao?.nome ?? ''}|${obs.trim()}`, produto_id: p.id, nome: p.nome, opcao: opcao?.nome ?? null, obs: obs.trim(), qtd, preco: unit, foto: p.foto_url })
                fechar()
              }}
              className="flex flex-1 items-center justify-between rounded-2xl bg-verde px-4 py-4 font-bold text-white"
            >
              <span>Adicionar</span>
              <span>{brl(unit * qtd)}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Qtd({ valor, menos, mais }: { valor: number; menos: () => void; mais: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-salvia p-1">
      <button onClick={menos} className="h-8 w-8 rounded-lg bg-papel font-bold text-verde">−</button>
      <span className="min-w-4 text-center text-sm font-bold">{valor}</span>
      <button onClick={mais} className="h-8 w-8 rounded-lg bg-papel font-bold text-verde">+</button>
    </div>
  )
}

function Checkout({ loja, sacola, setSacola, voltar, concluido }: {
  loja: Loja
  sacola: ItemSacola[]
  setSacola: Dispatch<SetStateAction<ItemSacola[]>>
  voltar: () => void
  concluido: (id: string) => void
}) {
  const salvos = lerJSON<{ nome?: string; whatsapp?: string; endereco?: string }>(K_DADOS, {})
  const tiposDisp: TipoPedido[] = MESA ? ['mesa'] : ([loja.aceita_entrega && 'entrega', loja.aceita_retirada && 'retirada'].filter(Boolean) as TipoPedido[])
  const [tipo, setTipo] = useState<TipoPedido>(tiposDisp[0] ?? 'retirada')
  const [nome, setNome] = useState(salvos.nome ?? '')
  const [whats, setWhats] = useState(mascaraFone(TEL_URL || salvos.whatsapp || ''))
  const [endereco, setEndereco] = useState(salvos.endereco ?? '')
  const [pag, setPag] = useState<FormaPagamento>('pix')
  const [troco, setTroco] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const topo = useRef<HTMLDivElement>(null)

  const subtotal = sacola.reduce((a, i) => a + i.qtd * i.preco, 0)
  const taxa = tipo === 'entrega' ? loja.taxa_entrega : 0
  const total = subtotal + taxa
  const faltaMinimo = tipo !== 'mesa' && subtotal < loja.pedido_minimo

  function mudarQtd(chave: string, d: number) {
    setSacola((s) => s.map((i) => (i.chave === chave ? { ...i, qtd: i.qtd + d } : i)).filter((i) => i.qtd > 0))
  }

  useEffect(() => {
    if (!sacola.length) voltar()
  }, [sacola.length, voltar])

  async function enviar() {
    setErro('')
    if (nome.trim().length < 2) return setErro('Digite seu nome.')
    if (tipo !== 'mesa' && whats.replace(/\D/g, '').length < 10) return setErro('Digite seu WhatsApp com DDD.')
    if (tipo === 'entrega' && endereco.trim().length < 5) return setErro('Digite o endereço de entrega.')
    setEnviando(true)
    localStorage.setItem(K_DADOS, JSON.stringify({ nome: nome.trim(), whatsapp: whats, endereco: endereco.trim() }))
    const { data, error } = await supabase.rpc('criar_pedido', {
      p: {
        tipo,
        mesa: MESA,
        origem: ORIGEM_URL,
        cliente_nome: nome.trim(),
        cliente_whatsapp: whats.replace(/\D/g, '') ? '55' + whats.replace(/\D/g, '') : '',
        endereco: endereco.trim(),
        observacao: obs.trim(),
        forma_pagamento: pag,
        troco_para: pag === 'dinheiro' && troco ? parseFloat(troco.replace(',', '.')) || null : null,
        itens: sacola.map((i) => ({ produto_id: i.produto_id, qtd: i.qtd, opcao: i.opcao, obs: i.obs })),
      },
    })
    setEnviando(false)
    if (error) {
      setErro(erroMsg(error))
      topo.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    const linha = (Array.isArray(data) ? data[0] : data) as { id: string } | null
    if (linha?.id) concluido(linha.id)
    else setErro('Não foi possível enviar. Tente de novo.')
  }

  const rotuloTipo: Record<TipoPedido, string> = { entrega: '🛵 Entrega', retirada: '🏪 Retirar na loja', mesa: `🪑 Mesa ${String(MESA ?? '').padStart(2, '0')}` }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-creme pb-10" ref={topo}>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-linha bg-papel px-4 py-3">
        <button onClick={voltar} className="text-2xl leading-none text-verde" aria-label="Voltar">‹</button>
        <b className="font-serif text-2xl text-verde">Finalizar pedido</b>
      </header>

      <div className="px-4">
        {erro && <div className="subir mt-3 rounded-2xl bg-c1b p-3 text-sm font-medium text-c1">{erro}</div>}

        <Bloco titulo="Sua sacola">
          {sacola.map((i) => (
            <div key={i.chave} className="flex items-center gap-3 border-b border-linha py-2 last:border-none">
              <Foto p={{ foto_url: i.foto, nome: i.nome }} className="h-12 w-12 flex-none rounded-xl text-xl" />
              <div className="min-w-0 flex-1">
                <b className="block text-sm">{i.nome}</b>
                <small className="text-xs text-mudo">{brl(i.preco)}{i.opcao ? ` · ${i.opcao}` : ''}{i.obs ? ` · “${i.obs}”` : ''}</small>
              </div>
              <Qtd valor={i.qtd} menos={() => mudarQtd(i.chave, -1)} mais={() => mudarQtd(i.chave, 1)} />
            </div>
          ))}
          <button onClick={voltar} className="mt-2 text-sm font-semibold text-ouro">+ Adicionar mais itens</button>
        </Bloco>

        <Bloco titulo={MESA ? 'Seu pedido' : 'Entrega ou retirada?'}>
          {tiposDisp.length > 1 && (
            <div className="flex rounded-2xl bg-salvia p-1">
              {tiposDisp.map((t) => (
                <button key={t} onClick={() => setTipo(t)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-semibold ${tipo === t ? 'bg-papel text-verde shadow-sm' : 'text-mudo'}`}>{rotuloTipo[t]}</button>
              ))}
            </div>
          )}
          {tiposDisp.length === 1 && <p className="text-sm font-semibold text-verde">{rotuloTipo[tiposDisp[0]]}</p>}
          <Campo value={nome} onChange={setNome} placeholder="Seu nome" />
          {tipo !== 'mesa' && <Campo value={whats} onChange={(v) => setWhats(mascaraFone(v))} placeholder="WhatsApp com DDD" inputMode="tel" />}
          {tipo === 'entrega' && <Campo value={endereco} onChange={setEndereco} placeholder="Endereço (rua, número, bairro, referência)" />}
          <p className="mt-2 text-xs text-mudo">
            {tipo === 'entrega' ? `⏱ Entrega em ${loja.tempo_entrega}` : tipo === 'retirada' ? `⏱ Pronto em ${loja.tempo_retirada} · ${loja.endereco ?? ''}` : 'A gente leva até a sua mesa 😊'}
          </p>
        </Bloco>

        <Bloco titulo="Pagamento">
          <p className="-mt-1 mb-2 text-xs text-mudo">{tipo === 'entrega' ? 'Você paga na entrega.' : tipo === 'mesa' ? 'Você paga no caixa.' : 'Você paga na retirada.'}</p>
          <div className="flex flex-col gap-2">
            {(['pix', 'cartao', 'dinheiro'] as FormaPagamento[]).map((f) => (
              <button key={f} onClick={() => setPag(f)} className={`flex items-center gap-3 rounded-2xl border-[1.5px] p-3 text-left ${pag === f ? 'border-verde bg-[#F1F7F2]' : 'border-linha'}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-salvia text-lg">{f === 'pix' ? '💠' : f === 'cartao' ? '💳' : '💵'}</span>
                <b className="flex-1 text-sm">{f === 'cartao' ? 'Cartão (crédito ou débito)' : PAGAMENTO[f]}</b>
                <span className={`h-5 w-5 rounded-full border-2 ${pag === f ? 'border-[6px] border-verde' : 'border-linha'}`} />
              </button>
            ))}
          </div>
          {pag === 'dinheiro' && tipo !== 'mesa' && <Campo value={troco} onChange={(v) => setTroco(v.replace(/[^\d,]/g, ''))} placeholder="Troco para quanto? (opcional)" inputMode="decimal" />}
        </Bloco>

        <Bloco titulo="Observação do pedido">
          <textarea value={obs} onChange={(e) => setObs(e.target.value.slice(0, 300))} rows={2} placeholder="Opcional" className="w-full resize-none rounded-xl border border-linha bg-creme px-3 py-2.5 text-[15px] outline-none focus:border-ouro" />
        </Bloco>

        <Bloco>
          <Linha a="Subtotal" b={brl(subtotal)} />
          {tipo === 'entrega' && <Linha a="Taxa de entrega" b={brl(taxa)} />}
          <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-linha pt-2">
            <b>Total</b>
            <b className="font-serif text-2xl text-verde">{brl(total)}</b>
          </div>
          {faltaMinimo && <p className="mt-2 text-xs font-semibold text-c1">Pedido mínimo de {brl(loja.pedido_minimo)}. Faltam {brl(loja.pedido_minimo - subtotal)}.</p>}
        </Bloco>

        <button disabled={enviando || !loja.aberto || faltaMinimo} onClick={enviar} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-verde py-4 text-[15px] font-bold text-white">
          {enviando ? <span className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white girar" /> : null}
          {!loja.aberto ? 'Loja fechada no momento' : enviando ? 'Enviando…' : `Enviar pedido · ${brl(total)}`}
        </button>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="mt-3 rounded-[20px] bg-papel p-4">
      {titulo && <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.14em] text-ouro">{titulo}</h3>}
      {children}
    </section>
  )
}

function Campo({ value, onChange, placeholder, inputMode }: { value: string; onChange: (v: string) => void; placeholder: string; inputMode?: 'tel' | 'decimal' }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} className="mt-2 w-full rounded-xl border border-linha bg-creme px-3.5 py-3 text-[15px] outline-none focus:border-ouro" />
}

function Linha({ a, b }: { a: string; b: string }) {
  return <div className="flex justify-between py-0.5 text-sm text-mudo"><span>{a}</span><span>{b}</span></div>
}

function AcompanharPedido({ id, loja, voltar }: { id: string; loja: Loja; voltar: () => void }) {
  const [p, setP] = useState<Acompanhamento | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    let t = 0
    async function buscar() {
      const { data, error } = await supabase.rpc('acompanhar_pedido', { p_id: id })
      if (!vivo) return
      const linha = (Array.isArray(data) ? data[0] : data) as Acompanhamento | undefined
      if (error || !linha) setFalhou(true)
      else {
        setP({ ...linha, total: num(linha.total) })
        if (linha.status === 'final' || linha.status === 'recusado') return
      }
      t = window.setTimeout(buscar, 8000)
    }
    void buscar()
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [id])

  const etapas = useMemo(() => {
    if (!p) return []
    const base: { st: StatusPedido; nome: string; ic: string }[] = [
      { st: 'analise', nome: 'Recebido', ic: '📥' },
      { st: 'preparo', nome: 'Preparando', ic: '👨‍🍳' },
      { st: 'pronto', nome: 'Pronto', ic: '🔔' },
    ]
    if (p.tipo === 'entrega') base.push({ st: 'entrega', nome: 'A caminho', ic: '🛵' })
    base.push({ st: 'final', nome: p.tipo === 'entrega' ? 'Entregue' : 'Finalizado', ic: '💚' })
    return base
  }, [p])

  if (falhou && !p) return <Centro><p className="text-mudo">Não encontramos esse pedido. <button className="font-semibold text-verde underline" onClick={voltar}>Voltar ao cardápio</button></p></Centro>
  if (!p) return <Centro><div className="h-8 w-8 rounded-full border-4 border-salvia border-t-verde girar" /></Centro>

  const idx = Math.max(0, etapas.findIndex((e) => e.st === p.status))
  const msg: Record<StatusPedido, string> = {
    analise: 'Recebemos seu pedido! Aguardando a loja confirmar…',
    preparo: 'A loja aceitou e já está preparando com carinho 💚',
    pronto: p.tipo === 'entrega' ? 'Pedido pronto! Já vai sair pra entrega.' : p.tipo === 'mesa' ? 'Pronto! Já estamos levando até a sua mesa.' : 'Pronto! Pode vir retirar 😊',
    entrega: 'Saiu para entrega! Já já chega aí 🛵',
    final: 'Pedido concluído. Obrigado por escolher a Bendito! 🙌',
    recusado: `Infelizmente não conseguimos atender este pedido.${p.motivo_recusa ? ` Motivo: ${p.motivo_recusa}` : ''}`,
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-creme px-4 pb-10 pt-6">
      <div className="flex items-center gap-3">
        <img src="/logo.jpg" alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-ouro2" />
        <div>
          <b className="font-serif text-2xl leading-none text-verde">Bendito</b>
          <small className="block text-xs text-mudo">Acompanhe seu pedido</small>
        </div>
      </div>

      <div className={`subir mt-5 rounded-[26px] p-5 text-white ${p.status === 'recusado' ? 'bg-[#8a3b2c]' : 'bg-verde'}`}>
        <div className="flex items-center justify-between">
          <b className="font-serif text-3xl">#{p.numero}</b>
          <span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold">
            {p.tipo === 'entrega' ? '🛵 Entrega' : p.tipo === 'mesa' ? `🪑 Mesa ${String(p.mesa ?? '').padStart(2, '0')}` : '🏪 Retirada'}
          </span>
        </div>
        <p className="mb-5 mt-2 text-[15px] leading-snug text-[#dbe8de]">{msg[p.status]}</p>
        {p.status !== 'recusado' && (
          <div className="relative flex">
            <div className="absolute left-[10%] right-[10%] top-4 h-[3px] rounded bg-[#2f5a43]">
              <div className="h-full rounded bg-ouro transition-all duration-700" style={{ width: `${(idx / Math.max(1, etapas.length - 1)) * 100}%` }} />
            </div>
            {etapas.map((e, i) => (
              <div key={e.st} className={`relative z-10 flex flex-1 flex-col items-center gap-1.5 text-center text-[10.5px] ${i <= idx ? 'font-semibold text-white' : 'text-[#9fbfaa]'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm ${i <= idx ? 'border-ouro bg-ouro' : 'border-[#3c6c52] bg-[#2f5a43]'} ${i === idx + 1 ? 'pulsar' : ''}`}>{e.ic}</span>
                {e.nome}
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 border-t border-white/15 pt-3 text-[13px] leading-relaxed text-[#cfe0d3]">
          {p.itens.map((i, k) => (
            <div key={k}>{i.qtd}x {i.nome}{i.opcao ? ` (${i.opcao})` : ''}</div>
          ))}
          <div className="mt-2 font-semibold text-white">Total {brl(p.total)} · {PAGAMENTO[p.forma_pagamento]}</div>
        </div>
      </div>

      {loja.whatsapp && (
        <a href={`https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(`Olá! Sobre o meu pedido #${p.numero}`)}`} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3.5 font-bold text-white">
          💬 Falar com a loja
        </a>
      )}
      <button onClick={voltar} className="mt-2 w-full rounded-2xl border border-linha bg-papel py-3.5 font-bold text-verde">Voltar ao cardápio</button>
    </div>
  )
}
