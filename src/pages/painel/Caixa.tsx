import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, num, type Pedido } from '../../lib/supabase'
import { brl, erroMsg, hora, PAGAMENTO } from '../../lib/util'

type Fechamento = {
  id: string
  data: string
  pedidos: number
  faturamento: number
  sistema: Record<string, number>
  contado: Record<string, number>
  diferenca: number
  observacao: string | null
  fechado_em: string
}

const FORMAS = ['pix', 'cartao', 'dinheiro'] as const

// "2026-11-25" no fuso do navegador (a loja está no Brasil)
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function limitesDoDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  const ini = new Date(a, m - 1, d, 0, 0, 0)
  const fim = new Date(a, m - 1, d + 1, 0, 0, 0)
  return { ini: ini.toISOString(), fim: fim.toISOString() }
}
function dataBonita(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}
const paraNum = (t: string) => {
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const txt = (v: number) => (v ? v.toFixed(2).replace('.', ',') : '')

export default function Caixa() {
  const [dia, setDia] = useState(hojeISO())
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [fech, setFech] = useState<Fechamento | null>(null)
  const [historico, setHistorico] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [contado, setContado] = useState<Record<string, string>>({ pix: '', cartao: '', dinheiro: '' })
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { ini, fim } = limitesDoDia(dia)
    const [p, f, h] = await Promise.all([
      supabase.from('pedidos').select('*').gte('criado_em', ini).lt('criado_em', fim).order('criado_em'),
      supabase.from('fechamentos').select('*').eq('data', dia).maybeSingle(),
      supabase.from('fechamentos').select('*').order('data', { ascending: false }).limit(31),
    ])
    if (p.error) setAviso('⚠️ ' + erroMsg(p.error))
    setPedidos(((p.data as Pedido[]) ?? []).map((x) => ({ ...x, total: num(x.total), taxa: num(x.taxa), subtotal: num(x.subtotal), itens: Array.isArray(x.itens) ? x.itens.map((i) => ({ ...i, qtd: num(i.qtd), preco: num(i.preco) })) : [] })))
    const fe = (f.data as Fechamento | null) ?? null
    setFech(fe)
    setContado(fe ? { pix: txt(num(fe.contado.pix)), cartao: txt(num(fe.contado.cartao)), dinheiro: txt(num(fe.contado.dinheiro)) } : { pix: '', cartao: '', dinheiro: '' })
    setObs(fe?.observacao ?? '')
    setHistorico(((h.data as Fechamento[]) ?? []).map((x) => ({ ...x, faturamento: num(x.faturamento), diferenca: num(x.diferenca) })))
    setCarregando(false)
  }, [dia])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // ---------- números do sistema ----------
  const r = useMemo(() => {
    const validos = pedidos.filter((p) => p.status !== 'recusado')
    const recusados = pedidos.filter((p) => p.status === 'recusado')
    const abertos = validos.filter((p) => p.status !== 'final')
    const porForma: Record<string, number> = { pix: 0, cartao: 0, dinheiro: 0 }
    const qtdForma: Record<string, number> = { pix: 0, cartao: 0, dinheiro: 0 }
    const porTipo: Record<string, number> = { entrega: 0, retirada: 0, mesa: 0 }
    const porOrigem: Record<string, number> = {}
    const produtos = new Map<string, { qtd: number; valor: number }>()
    let taxas = 0
    let aCobrar = 0
    for (const p of validos) {
      porForma[p.forma_pagamento] += p.total
      qtdForma[p.forma_pagamento]++
      porTipo[p.tipo] += p.total
      porOrigem[p.origem] = (porOrigem[p.origem] ?? 0) + 1
      taxas += p.taxa
      if (!p.pago) aCobrar += p.total
      for (const i of p.itens) {
        const k = i.nome + (i.opcao ? ` (${i.opcao})` : '')
        const at = produtos.get(k) ?? { qtd: 0, valor: 0 }
        produtos.set(k, { qtd: at.qtd + i.qtd, valor: at.valor + i.qtd * i.preco })
      }
    }
    const faturamento = validos.reduce((a, p) => a + p.total, 0)
    return {
      validos,
      recusados,
      abertos,
      porForma,
      qtdForma,
      porTipo,
      porOrigem,
      taxas,
      aCobrar,
      faturamento,
      ticket: validos.length ? faturamento / validos.length : 0,
      ranking: [...produtos.entries()].sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 10),
    }
  }, [pedidos])

  const contadoNum = { pix: paraNum(contado.pix), cartao: paraNum(contado.cartao), dinheiro: paraNum(contado.dinheiro) }
  const preencheuAlgo = FORMAS.some((f) => contado[f].trim() !== '')
  const totalContado = contadoNum.pix + contadoNum.cartao + contadoNum.dinheiro
  const diferenca = totalContado - r.faturamento

  async function fechar() {
    if (r.abertos.length && !window.confirm(`Ainda tem ${r.abertos.length} pedido(s) que não foram finalizados. Fechar o caixa mesmo assim?`)) return
    setSalvando(true)
    const { data: u } = await supabase.auth.getUser()
    const dados = {
      data: dia,
      pedidos: r.validos.length,
      faturamento: r.faturamento,
      sistema: { ...r.porForma, taxas: r.taxas, a_cobrar: r.aCobrar, recusados: r.recusados.length },
      contado: contadoNum,
      diferenca: Math.round(diferenca * 100) / 100,
      observacao: obs.trim() || null,
      fechado_por: u.user?.id ?? null,
      fechado_em: new Date().toISOString(),
    }
    const { error } = await supabase.from('fechamentos').upsert(dados, { onConflict: 'data' })
    setSalvando(false)
    if (error) return setAviso('⚠️ ' + erroMsg(error))
    setAviso('✓ Caixa fechado')
    window.setTimeout(() => setAviso(''), 2500)
    void carregar()
  }

  function mudarDia(delta: number) {
    const [a, m, d] = dia.split('-').map(Number)
    const n = new Date(a, m - 1, d + delta)
    setDia(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`)
  }

  const cartao = 'rounded-2xl border border-borda bg-white p-4'
  const campo = 'w-full rounded-xl border border-borda bg-white px-3 py-2 text-right text-sm outline-none focus:border-ouro'

  return (
    <div className="h-full overflow-y-auto">
      <div id="relatorio" className="mx-auto max-w-4xl p-3 pb-20">
        {/* escolher o dia */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => mudarDia(-1)} className="rounded-xl border border-borda bg-white px-3 py-2 font-bold print:hidden">‹</button>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="rounded-xl border border-borda bg-white px-3 py-2 text-sm print:hidden" />
          <button onClick={() => mudarDia(1)} disabled={dia >= hojeISO()} className="rounded-xl border border-borda bg-white px-3 py-2 font-bold print:hidden">›</button>
          <b className="ml-1 capitalize">{dataBonita(dia)}</b>
          {fech && <span className="rounded-lg bg-c4b px-2 py-1 text-xs font-bold text-c4">✓ Fechado às {hora(fech.fechado_em)}</span>}
          <button onClick={() => window.print()} className="ml-auto rounded-xl border border-borda bg-white px-3 py-2 text-sm font-semibold print:hidden">🖨️ Imprimir</button>
        </div>

        {carregando ? (
          <p className="p-6 text-sm text-mudo">Carregando…</p>
        ) : (
          <>
            {/* resumo */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi t="Faturamento" v={brl(r.faturamento)} destaque />
              <Kpi t="Pedidos" v={String(r.validos.length)} s={r.recusados.length ? `${r.recusados.length} recusado(s)` : undefined} />
              <Kpi t="Ticket médio" v={brl(r.ticket)} />
              <Kpi t="Taxas de entrega" v={brl(r.taxas)} />
            </div>

            {r.abertos.length > 0 && (
              <div className="mt-3 rounded-xl bg-c2b p-3 text-sm text-[#8a5a10]">
                ⚠️ {r.abertos.length} pedido(s) ainda não foram finalizados: {r.abertos.map((p) => '#' + p.numero).join(', ')}
              </div>
            )}
            {r.aCobrar > 0 && (
              <div className="mt-2 rounded-xl bg-c1b p-3 text-sm text-c1">
                💸 {brl(r.aCobrar)} em pedidos marcados como <b>A cobrar</b>. Confira se foram pagos (clique na etiqueta do pedido no quadro pra marcar como pago).
              </div>
            )}

            {/* conferência */}
            <section className={`${cartao} mt-3`}>
              <b className="text-[15px]">Conferência do caixa</b>
              <p className="mb-3 text-xs text-mudo">Digite o que entrou de verdade (extrato do Pix, relatório da maquininha e dinheiro na gaveta). O sistema mostra a diferença.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-mudo">
                      <th className="pb-2 font-semibold">Forma</th>
                      <th className="pb-2 text-right font-semibold">Pedidos</th>
                      <th className="pb-2 text-right font-semibold">Sistema</th>
                      <th className="pb-2 pl-3 text-right font-semibold">Conferido</th>
                      <th className="pb-2 pl-3 text-right font-semibold">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FORMAS.map((f) => {
                      const dif = contadoNum[f] - r.porForma[f]
                      const preenchido = contado[f].trim() !== ''
                      return (
                        <tr key={f} className="border-t border-borda">
                          <td className="py-2 font-semibold">{f === 'pix' ? '💠' : f === 'cartao' ? '💳' : '💵'} {PAGAMENTO[f]}</td>
                          <td className="py-2 text-right text-mudo">{r.qtdForma[f]}</td>
                          <td className="py-2 text-right font-semibold">{brl(r.porForma[f])}</td>
                          <td className="w-32 py-2 pl-3">
                            <input value={contado[f]} onChange={(e) => setContado((c) => ({ ...c, [f]: e.target.value.replace(/[^\d,.]/g, '') }))} inputMode="decimal" placeholder="0,00" className={campo} />
                          </td>
                          <td className={`py-2 pl-3 text-right font-bold ${!preenchido ? 'text-borda' : Math.abs(dif) < 0.01 ? 'text-c4' : dif > 0 ? 'text-c3' : 'text-c1'}`}>
                            {!preenchido ? '—' : Math.abs(dif) < 0.01 ? '✓ OK' : (dif > 0 ? '+' : '') + brl(dif)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-tinta/20">
                      <td className="py-2 font-bold">Total</td>
                      <td className="py-2 text-right text-mudo">{r.validos.length}</td>
                      <td className="py-2 text-right font-bold">{brl(r.faturamento)}</td>
                      <td className="py-2 pl-3 text-right font-bold">{preencheuAlgo ? brl(totalContado) : '—'}</td>
                      <td className={`py-2 pl-3 text-right font-extrabold ${!preencheuAlgo ? 'text-borda' : Math.abs(diferenca) < 0.01 ? 'text-c4' : diferenca > 0 ? 'text-c3' : 'text-c1'}`}>
                        {!preencheuAlgo ? '—' : Math.abs(diferenca) < 0.01 ? '✓ Bateu' : (diferenca > 0 ? 'Sobra ' : 'Falta ') + brl(Math.abs(diferenca))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <textarea value={obs} onChange={(e) => setObs(e.target.value.slice(0, 500))} rows={2} placeholder="Observação (ex: troco que faltou, sangria, vale de funcionário…)" className="mt-3 w-full resize-none rounded-xl border border-borda px-3 py-2 text-sm outline-none focus:border-ouro" />
              <div className="mt-3 flex flex-wrap items-center gap-3 print:hidden">
                <button disabled={salvando} onClick={fechar} className="rounded-xl bg-verde px-5 py-3 font-bold text-white">
                  {salvando ? 'Salvando…' : fech ? '💾 Atualizar fechamento' : '🔒 Fechar caixa do dia'}
                </button>
                <span className="text-xs text-mudo">Pode fechar de novo depois, se precisar corrigir.</span>
              </div>
            </section>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {/* mais vendidos */}
              <section className={cartao}>
                <b className="text-[15px]">Mais vendidos do dia</b>
                {!r.ranking.length && <p className="mt-2 text-sm text-mudo">Nenhuma venda nesse dia.</p>}
                {r.ranking.map(([nome, v], i) => (
                  <div key={nome} className="flex items-center gap-2 border-b border-borda py-1.5 text-sm last:border-none">
                    <span className="w-5 text-xs font-bold text-mudo">{i + 1}º</span>
                    <span className="flex-1 truncate">{nome}</span>
                    <b className="w-10 text-right">{v.qtd}x</b>
                    <span className="w-24 text-right text-mudo">{brl(v.valor)}</span>
                  </div>
                ))}
              </section>

              {/* como vendeu */}
              <section className={cartao}>
                <b className="text-[15px]">Como vendeu</b>
                <div className="mt-2 text-sm">
                  <Linha a="🛵 Entrega" b={brl(r.porTipo.entrega)} />
                  <Linha a="🏪 Retirada" b={brl(r.porTipo.retirada)} />
                  <Linha a="🪑 Mesa" b={brl(r.porTipo.mesa)} />
                </div>
                <div className="mt-3 border-t border-borda pt-2 text-sm">
                  <span className="text-xs font-semibold text-mudo">Pedidos por origem</span>
                  {Object.entries(r.porOrigem).map(([o, n]) => (
                    <Linha key={o} a={o === 'whatsapp' ? '💬 WhatsApp' : o === 'instagram' ? '📸 Instagram' : o === 'mesa' ? '🪑 QR da mesa' : '🌐 Site'} b={`${n}`} />
                  ))}
                  {!Object.keys(r.porOrigem).length && <p className="text-mudo">—</p>}
                </div>
              </section>
            </div>

            {/* lista de pedidos */}
            <section className={`${cartao} mt-3`}>
              <b className="text-[15px]">Pedidos do dia ({pedidos.length})</b>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {pedidos.map((p) => (
                      <tr key={p.id} className={`border-t border-borda ${p.status === 'recusado' ? 'text-mudo line-through' : ''}`}>
                        <td className="py-1.5 font-bold">#{p.numero}</td>
                        <td className="py-1.5 text-mudo">{hora(p.criado_em)}</td>
                        <td className="max-w-40 truncate py-1.5">{p.cliente_nome}</td>
                        <td className="py-1.5 text-mudo">{PAGAMENTO[p.forma_pagamento]}</td>
                        <td className="py-1.5">{p.status === 'recusado' ? 'Recusado' : p.pago ? <span className="text-c4">Pago</span> : <span className="text-c1">A cobrar</span>}</td>
                        <td className="py-1.5 text-right font-semibold">{brl(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!pedidos.length && <p className="text-sm text-mudo">Nenhum pedido nesse dia.</p>}
              </div>
            </section>

            {/* histórico */}
            <section className={`${cartao} mt-3 print:hidden`}>
              <b className="text-[15px]">Últimos fechamentos</b>
              {!historico.length && <p className="mt-2 text-sm text-mudo">Nenhum caixa fechado ainda.</p>}
              {historico.map((h) => (
                <button key={h.id} onClick={() => setDia(h.data)} className="flex w-full items-center gap-2 border-b border-borda py-2 text-left text-sm last:border-none">
                  <span className="w-24 font-semibold">{h.data.split('-').reverse().join('/')}</span>
                  <span className="flex-1 text-mudo">{h.pedidos} pedidos</span>
                  <b className="w-24 text-right">{brl(h.faturamento)}</b>
                  <span className={`w-28 text-right text-xs font-bold ${Math.abs(h.diferenca) < 0.01 ? 'text-c4' : h.diferenca > 0 ? 'text-c3' : 'text-c1'}`}>
                    {Math.abs(h.diferenca) < 0.01 ? '✓ Bateu' : (h.diferenca > 0 ? 'Sobra ' : 'Falta ') + brl(Math.abs(h.diferenca))}
                  </span>
                </button>
              ))}
            </section>
          </>
        )}
      </div>
      {aviso && <div className="subir fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-white">{aviso}</div>}
    </div>
  )
}

function Kpi({ t, v, s, destaque }: { t: string; v: string; s?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${destaque ? 'bg-verde text-white' : 'border border-borda bg-white'}`}>
      <small className={`text-[11px] font-semibold uppercase tracking-wide ${destaque ? 'text-[#bcd3c2]' : 'text-mudo'}`}>{t}</small>
      <b className="block text-xl">{v}</b>
      {s && <small className={destaque ? 'text-[#bcd3c2]' : 'text-mudo'}>{s}</small>}
    </div>
  )
}

function Linha({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span>{a}</span>
      <b>{b}</b>
    </div>
  )
}
