import { useEffect, useState } from 'react'
import { supabase, num, type Loja } from '../../lib/supabase'
import { brl, erroMsg } from '../../lib/util'

export default function LojaConfig() {
  const [l, setL] = useState<Loja | null>(null)
  const [taxa, setTaxa] = useState('')
  const [minimo, setMinimo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [copiado, setCopiado] = useState('')

  useEffect(() => {
    supabase.from('loja').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (error) return setAviso('⚠️ ' + erroMsg(error))
      const loja = { ...(data as Loja), taxa_entrega: num(data.taxa_entrega), pedido_minimo: num(data.pedido_minimo) }
      setL(loja)
      setTaxa(String(loja.taxa_entrega).replace('.', ','))
      setMinimo(String(loja.pedido_minimo).replace('.', ','))
    })
  }, [])

  if (!l) return <div className="p-6 text-sm text-mudo">{aviso || 'Carregando…'}</div>

  const set = <K extends keyof Loja>(k: K, v: Loja[K]) => setL((x) => (x ? { ...x, [k]: v } : x))
  const paraNum = (t: string) => parseFloat(t.replace(',', '.')) || 0

  async function salvar(parcial?: Partial<Loja>) {
    if (!l) return
    setSalvando(true)
    const dados = parcial ?? {
      aberto: l.aberto,
      aceita_entrega: l.aceita_entrega,
      aceita_retirada: l.aceita_retirada,
      aceita_mesa: l.aceita_mesa,
      mesas: Math.max(1, Math.min(200, l.mesas || 1)),
      taxa_entrega: paraNum(taxa),
      pedido_minimo: paraNum(minimo),
      tempo_entrega: l.tempo_entrega,
      tempo_retirada: l.tempo_retirada,
      endereco: l.endereco,
      whatsapp: (l.whatsapp ?? '').replace(/\D/g, '') || null,
      aviso: l.aviso?.trim() || null,
    }
    const { error } = await supabase.from('loja').update(dados).eq('id', 1)
    setSalvando(false)
    setAviso(error ? '⚠️ ' + erroMsg(error) : '✓ Salvo')
    window.setTimeout(() => setAviso(''), 2500)
  }

  const base = window.location.origin
  const links: [string, string][] = [
    ['📸 Link da bio do Instagram', `${base}/?o=ig`],
    ['💬 Link para o WhatsApp', `${base}/?o=wa`],
    ['🌐 Link geral', `${base}/`],
  ]

  function copiar(url: string) {
    void navigator.clipboard?.writeText(url)
    setCopiado(url)
    window.setTimeout(() => setCopiado(''), 1500)
  }

  function imprimirQrMesas() {
    if (!l) return
    const w = window.open('', '_blank')
    if (!w) return
    const cartoes = Array.from({ length: l.mesas }, (_, i) => i + 1)
      .map((n) => {
        const url = `${base}/?mesa=${n}`
        return `<div class="c"><img src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=8&data=${encodeURIComponent(url)}"><b>Mesa ${String(n).padStart(2, '0')}</b><span>Aponte a câmera e faça seu pedido</span></div>`
      })
      .join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR das mesas · Bendito</title><style>
      body{font-family:Georgia,serif;margin:0;padding:10mm;color:#1E4A33}
      .g{display:grid;grid-template-columns:repeat(2,1fr);gap:8mm}
      .c{border:2px solid #D9BE8A;border-radius:6mm;padding:6mm;text-align:center;break-inside:avoid}
      .c img{width:55mm;height:55mm}
      .c b{display:block;font-size:26px;margin-top:3mm}
      .c span{font-family:Arial,sans-serif;font-size:12px;color:#7B776D}
      h1{text-align:center;margin:0 0 6mm}
      @media print{button{display:none}}
    </style></head><body><button onclick="print()" style="margin-bottom:6mm;padding:10px 16px">Imprimir</button><h1>Bendito · QR Code das mesas</h1><div class="g">${cartoes}</div></body></html>`)
    w.document.close()
  }

  const campo = 'mt-1 w-full rounded-xl border border-borda bg-white px-3 py-2.5 text-sm outline-none focus:border-ouro'
  const chk = (k: 'aceita_entrega' | 'aceita_retirada' | 'aceita_mesa', t: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l[k]} onChange={(e) => set(k, e.target.checked)} /> {t}</label>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-3 pb-20">
        <button
          onClick={() => {
            const n = !l.aberto
            set('aberto', n)
            void salvar({ aberto: n })
          }}
          className={`flex w-full items-center justify-between rounded-2xl p-4 text-left text-white ${l.aberto ? 'bg-c4' : 'bg-c1'}`}
        >
          <span>
            <b className="block text-lg">{l.aberto ? '🟢 Loja ABERTA' : '🔴 Loja FECHADA'}</b>
            <small className="opacity-90">{l.aberto ? 'Recebendo pedidos pelo cardápio' : 'O cardápio aparece, mas não aceita pedidos'}</small>
          </span>
          <span className="rounded-xl bg-white/20 px-3 py-2 text-sm font-bold">{l.aberto ? 'Fechar' : 'Abrir'}</span>
        </button>

        <section className="mt-3 rounded-2xl border border-borda bg-white p-4">
          <b>Como recebe os pedidos</b>
          <div className="mt-2 flex flex-wrap gap-4">
            {chk('aceita_entrega', 'Entrega')}
            {chk('aceita_retirada', 'Retirada na loja')}
            {chk('aceita_mesa', 'Pedido na mesa (QR Code)')}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-mudo">Taxa de entrega (R$)<input value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^\d,]/g, ''))} inputMode="decimal" className={campo} /></label>
            <label className="text-xs font-semibold text-mudo">Pedido mínimo (R$)<input value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/[^\d,]/g, ''))} inputMode="decimal" className={campo} /></label>
            <label className="text-xs font-semibold text-mudo">Tempo de entrega<input value={l.tempo_entrega} onChange={(e) => set('tempo_entrega', e.target.value)} className={campo} /></label>
            <label className="text-xs font-semibold text-mudo">Tempo p/ retirada<input value={l.tempo_retirada} onChange={(e) => set('tempo_retirada', e.target.value)} className={campo} /></label>
            <label className="text-xs font-semibold text-mudo">Número de mesas<input type="number" min={1} max={200} value={l.mesas} onChange={(e) => set('mesas', parseInt(e.target.value, 10) || 1)} className={campo} /></label>
            <label className="text-xs font-semibold text-mudo">WhatsApp da loja (com DDD)<input value={l.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" placeholder="5564992444300" className={campo} /></label>
          </div>
          <label className="mt-2 block text-xs font-semibold text-mudo">Endereço<input value={l.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} className={campo} /></label>
          <label className="mt-2 block text-xs font-semibold text-mudo">Aviso no topo do cardápio (opcional)<input value={l.aviso ?? ''} onChange={(e) => set('aviso', e.target.value)} placeholder="Ex: Encomendas de Natal abertas! 🎄" className={campo} /></label>
          <div className="mt-3 flex items-center gap-3">
            <button disabled={salvando} onClick={() => void salvar()} className="rounded-xl bg-verde px-5 py-3 font-bold text-white">{salvando ? 'Salvando…' : 'Salvar'}</button>
            <span className="text-xs text-mudo">Hoje: taxa {brl(paraNum(taxa))} · mínimo {brl(paraNum(minimo))}</span>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-borda bg-white p-4">
          <b>Links do cardápio</b>
          <p className="mb-2 text-xs text-mudo">Cada link marca de onde o pedido veio (aparece no painel).</p>
          {links.map(([t, u]) => (
            <div key={u} className="flex items-center gap-2 border-b border-borda py-2 last:border-none">
              <div className="min-w-0 flex-1">
                <b className="block text-sm">{t}</b>
                <span className="block truncate text-xs text-mudo">{u}</span>
              </div>
              <button onClick={() => copiar(u)} className="rounded-lg border border-borda px-3 py-1.5 text-xs font-semibold">{copiado === u ? '✓ Copiado' : 'Copiar'}</button>
            </div>
          ))}
          {l.aceita_mesa && (
            <button onClick={imprimirQrMesas} className="mt-3 rounded-xl border border-borda px-4 py-2.5 text-sm font-semibold">🖨️ Imprimir QR Code das {l.mesas} mesas</button>
          )}
        </section>
      </div>
      {aviso && <div className="subir fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-white">{aviso}</div>}
    </div>
  )
}
