import { useCallback, useEffect, useState } from 'react'
import { supabase, num, type Categoria, type Opcao, type Produto } from '../../lib/supabase'
import { brl, erroMsg } from '../../lib/util'

type Rascunho = Omit<Produto, 'id'> & { id?: string }

const vazio = (categoria_id: string): Rascunho => ({
  categoria_id,
  nome: '',
  descricao: '',
  preco: 0,
  preco_de: null,
  foto_url: null,
  opcoes: [],
  ativo: true,
  destaque: false,
  ordem: 99,
})

export default function Produtos() {
  const [cats, setCats] = useState<Categoria[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [aviso, setAviso] = useState('')
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('categorias').select('*').order('ordem'),
      supabase.from('produtos').select('*').order('ordem'),
    ])
    if (c.error || p.error) return mostrar('⚠️ ' + erroMsg(c.error ?? p.error))
    setCats(c.data as Categoria[])
    setProds((p.data as Produto[]).map((x) => ({ ...x, preco: num(x.preco), preco_de: x.preco_de == null ? null : num(x.preco_de), opcoes: Array.isArray(x.opcoes) ? x.opcoes.map((o) => ({ nome: o.nome, extra: num(o.extra) })) : [] })))
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function mostrar(t: string) {
    setAviso(t)
    window.setTimeout(() => setAviso((a) => (a === t ? '' : a)), 2500)
  }

  async function alternar(p: Produto, campo: 'ativo' | 'destaque') {
    setProds((ps) => ps.map((x) => (x.id === p.id ? { ...x, [campo]: !p[campo] } : x)))
    const { error } = await supabase.from('produtos').update({ [campo]: !p[campo] }).eq('id', p.id)
    if (error) {
      mostrar('⚠️ ' + erroMsg(error))
      void carregar()
    }
  }

  async function novaCategoria() {
    const nome = window.prompt('Nome da nova categoria (ex: Bolos)')
    if (!nome?.trim()) return
    const icone = window.prompt('Um emoji para a categoria (opcional)', '🍰') ?? ''
    const { error } = await supabase.from('categorias').insert({ nome: nome.trim(), icone: icone.trim() || null, ordem: cats.length + 1 })
    if (error) return mostrar('⚠️ ' + erroMsg(error))
    void carregar()
  }

  async function editarCategoria(c: Categoria) {
    const nome = window.prompt('Nome da categoria', c.nome)
    if (nome === null) return
    const icone = window.prompt('Emoji', c.icone ?? '') ?? c.icone
    const { error } = await supabase.from('categorias').update({ nome: nome.trim() || c.nome, icone: icone?.trim() || null }).eq('id', c.id)
    if (error) return mostrar('⚠️ ' + erroMsg(error))
    void carregar()
  }

  async function moverCategoria(c: Categoria, d: -1 | 1) {
    const i = cats.findIndex((x) => x.id === c.id)
    const outro = cats[i + d]
    if (!outro) return
    await Promise.all([
      supabase.from('categorias').update({ ordem: outro.ordem }).eq('id', c.id),
      supabase.from('categorias').update({ ordem: c.ordem === outro.ordem ? c.ordem + d : c.ordem }).eq('id', outro.id),
    ])
    void carregar()
  }

  async function alternarCategoria(c: Categoria) {
    const { error } = await supabase.from('categorias').update({ ativo: !c.ativo }).eq('id', c.id)
    if (error) return mostrar('⚠️ ' + erroMsg(error))
    void carregar()
  }

  async function apagarCategoria(c: Categoria) {
    if (prods.some((p) => p.categoria_id === c.id)) return mostrar('Tire ou apague os produtos dessa categoria antes.')
    if (!window.confirm(`Apagar a categoria "${c.nome}"?`)) return
    const { error } = await supabase.from('categorias').delete().eq('id', c.id)
    if (error) return mostrar('⚠️ ' + erroMsg(error))
    void carregar()
  }

  const q = busca.trim().toLowerCase()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-3 pb-20">
        <div className="flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar produto" className="min-w-0 flex-1 rounded-xl border border-borda bg-white px-3 py-2 text-sm outline-none" />
          <button onClick={novaCategoria} className="rounded-xl border border-borda bg-white px-3 py-2 text-sm font-semibold">+ Categoria</button>
          <button onClick={() => cats[0] ? setEditando(vazio(cats[0].id)) : mostrar('Crie uma categoria primeiro.')} className="rounded-xl bg-c1 px-3 py-2 text-sm font-bold text-white">+ Novo produto</button>
        </div>

        {cats.map((c, ci) => {
          const lista = prods.filter((p) => p.categoria_id === c.id && (!q || p.nome.toLowerCase().includes(q)))
          if (q && !lista.length) return null
          return (
            <section key={c.id} className="mt-4 rounded-2xl border border-borda bg-white">
              <header className="flex items-center gap-2 border-b border-borda px-3 py-2.5">
                <b className={`flex-1 text-[15px] ${c.ativo ? '' : 'text-mudo line-through'}`}>{c.icone} {c.nome}</b>
                <button onClick={() => moverCategoria(c, -1)} disabled={ci === 0} className="px-1.5 text-mudo" title="Subir">▲</button>
                <button onClick={() => moverCategoria(c, 1)} disabled={ci === cats.length - 1} className="px-1.5 text-mudo" title="Descer">▼</button>
                <button onClick={() => alternarCategoria(c)} className="text-xs font-semibold text-mudo">{c.ativo ? 'Ocultar' : 'Mostrar'}</button>
                <button onClick={() => editarCategoria(c)} className="text-xs font-semibold text-mudo">Renomear</button>
                <button onClick={() => apagarCategoria(c)} className="text-xs font-semibold text-c1">Apagar</button>
              </header>
              {!lista.length && <p className="p-4 text-sm text-mudo">Nenhum produto. <button className="font-semibold text-c1" onClick={() => setEditando(vazio(c.id))}>+ adicionar</button></p>}
              {lista.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 border-b border-borda px-3 py-2.5 last:border-none ${p.ativo ? '' : 'opacity-50'}`}>
                  <Interruptor ligado={p.ativo} onClick={() => alternar(p, 'ativo')} />
                  {p.foto_url ? <img src={p.foto_url} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-fundo">🍽️</div>}
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{p.nome} {p.destaque && <span title="Destaque" className="text-ouro">★</span>}</b>
                    <span className="text-xs">
                      {p.preco_de != null && p.preco_de > p.preco && <s className="mr-1 text-mudo">{brl(p.preco_de)}</s>}
                      <b className="text-c4">{brl(p.preco)}</b>
                      {p.opcoes.length > 0 && <span className="text-mudo"> · {p.opcoes.length} opções</span>}
                    </span>
                  </div>
                  <button onClick={() => alternar(p, 'destaque')} title="Destaque em 'Mais pedidos'" className={`text-lg ${p.destaque ? 'text-ouro' : 'text-borda'}`}>★</button>
                  <button onClick={() => setEditando({ ...p })} className="rounded-lg border border-borda px-2.5 py-1.5 text-xs font-semibold">Editar</button>
                </div>
              ))}
            </section>
          )
        })}
        <p className="mt-4 text-center text-xs text-mudo">O interruptor liga/desliga o produto no cardápio na hora (ex: acabou o pudim). ★ = aparece em "Mais pedidos".</p>
      </div>

      {editando && <Editor rascunho={editando} cats={cats} fechar={() => setEditando(null)} salvo={() => { setEditando(null); void carregar(); mostrar('✓ Produto salvo') }} />}
      {aviso && <div className="subir fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-white">{aviso}</div>}
    </div>
  )
}

function Interruptor({ ligado, onClick }: { ligado: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={ligado ? 'Desligar' : 'Ligar'} className={`relative h-6 w-11 flex-none rounded-full transition-colors ${ligado ? 'bg-c1' : 'bg-borda'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ligado ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

// reduz a foto no próprio celular/PC antes de enviar (máx. 1000px, jpg)
async function reduzirFoto(arq: File): Promise<Blob> {
  const url = URL.createObjectURL(arq)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falha(new Error('Não consegui abrir essa imagem.'))
      i.src = url
    })
    const max = 1000
    const escala = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala)
    c.height = Math.round(img.height * escala)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao converter a foto.'))), 'image/jpeg', 0.85))
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Editor({ rascunho, cats, fechar, salvo }: { rascunho: Rascunho; cats: Categoria[]; fechar: () => void; salvo: () => void }) {
  const [r, setR] = useState<Rascunho>(rascunho)
  const [precoTxt, setPrecoTxt] = useState(rascunho.preco ? String(rascunho.preco).replace('.', ',') : '')
  const [deTxt, setDeTxt] = useState(rascunho.preco_de != null ? String(rascunho.preco_de).replace('.', ',') : '')
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }))
  const paraNum = (t: string) => parseFloat(t.replace(/\./g, '').replace(',', '.'))

  async function enviarFoto(arq: File | undefined) {
    if (!arq) return
    setErro('')
    setEnviandoFoto(true)
    try {
      const blob = await reduzirFoto(arq)
      const caminho = `${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('produtos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
      set('foto_url', supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl)
    } catch (e) {
      setErro(erroMsg(e))
    }
    setEnviandoFoto(false)
  }

  function mudarOpcao(i: number, campo: keyof Opcao, valor: string) {
    const ops = r.opcoes.map((o, k) => (k === i ? { ...o, [campo]: campo === 'extra' ? paraNum(valor) || 0 : valor } : o))
    set('opcoes', ops)
  }

  async function salvar() {
    setErro('')
    const preco = paraNum(precoTxt)
    const de = deTxt.trim() ? paraNum(deTxt) : null
    if (!r.nome.trim()) return setErro('Dê um nome ao produto.')
    if (!Number.isFinite(preco) || preco < 0) return setErro('Preço inválido.')
    if (de != null && !Number.isFinite(de)) return setErro('Preço "de" inválido.')
    const opcoes = r.opcoes.filter((o) => o.nome.trim()).map((o) => ({ nome: o.nome.trim(), extra: Number.isFinite(o.extra) ? o.extra : 0 }))
    if (new Set(opcoes.map((o) => o.nome)).size !== opcoes.length) return setErro('Tem opção com nome repetido.')
    const dados = {
      categoria_id: r.categoria_id,
      nome: r.nome.trim(),
      descricao: r.descricao?.trim() || null,
      preco,
      preco_de: de,
      foto_url: r.foto_url,
      opcoes,
      ativo: r.ativo,
      destaque: r.destaque,
      ordem: r.ordem,
    }
    setSalvando(true)
    const { error } = r.id ? await supabase.from('produtos').update(dados).eq('id', r.id) : await supabase.from('produtos').insert(dados)
    setSalvando(false)
    if (error) return setErro(erroMsg(error))
    salvo()
  }

  async function apagar() {
    if (!r.id || !window.confirm(`Apagar "${r.nome}" de vez? (Se for só por hoje, use o interruptor.)`)) return
    const { error } = await supabase.from('produtos').delete().eq('id', r.id)
    if (error) return setErro(erroMsg(error))
    salvo()
  }

  const campo = 'w-full rounded-xl border border-borda bg-white px-3 py-2.5 text-sm outline-none focus:border-ouro'

  return (
    <>
      <div onClick={fechar} className="fixed inset-0 z-40 bg-black/40" />
      <div className="subir fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92vh] max-w-lg overflow-y-auto rounded-t-3xl bg-fundo p-4 sm:bottom-auto sm:top-[4vh] sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <b className="text-lg">{r.id ? 'Editar produto' : 'Novo produto'}</b>
          <button onClick={fechar} className="h-8 w-8 rounded-full bg-white">✕</button>
        </div>
        {erro && <p className="mb-2 rounded-xl bg-c1b p-2.5 text-sm text-c1">{erro}</p>}

        <div className="flex gap-3">
          <label className="relative flex h-28 w-28 flex-none cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-borda bg-white text-center text-xs text-mudo">
            {r.foto_url ? <img src={r.foto_url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span>📷<br />Adicionar foto</span>}
            {enviandoFoto && <span className="absolute inset-0 flex items-center justify-center bg-white/80">Enviando…</span>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void enviarFoto(e.target.files?.[0])} />
          </label>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input value={r.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome (ex: Pudim de leite)" className={campo} />
            <select value={r.categoria_id} onChange={(e) => set('categoria_id', e.target.value)} className={campo}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
            </select>
            {r.foto_url && <button onClick={() => set('foto_url', null)} className="self-start text-xs font-semibold text-c1">Remover foto</button>}
          </div>
        </div>

        <textarea value={r.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} rows={2} placeholder="Descrição (aparece pro cliente)" className={`${campo} mt-2 resize-none`} />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-mudo">Preço (R$)<input value={precoTxt} onChange={(e) => setPrecoTxt(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="9,00" className={`${campo} mt-1`} /></label>
          <label className="text-xs font-semibold text-mudo">Preço "de" (riscado, opcional)<input value={deTxt} onChange={(e) => setDeTxt(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="12,00" className={`${campo} mt-1`} /></label>
        </div>

        <div className="mt-3 rounded-2xl border border-borda bg-white p-3">
          <b className="text-sm">Opções</b>
          <p className="mb-2 text-xs text-mudo">Ex: Fatia / Inteiro, Médio / Grande, sabores. O cliente escolhe uma. O valor extra soma no preço.</p>
          {r.opcoes.map((o, i) => (
            <div key={`${i}-${r.opcoes.length}`} className="mb-1.5 flex gap-1.5">
              <input value={o.nome} onChange={(e) => mudarOpcao(i, 'nome', e.target.value)} placeholder="Nome da opção" className="min-w-0 flex-1 rounded-xl border border-borda bg-white px-3 py-2.5 text-sm outline-none focus:border-ouro" />
              <input defaultValue={o.extra ? String(o.extra).replace('.', ',') : ''} onChange={(e) => mudarOpcao(i, 'extra', e.target.value)} inputMode="decimal" placeholder="+ R$ 0" className="w-24 flex-none rounded-xl border border-borda bg-white px-3 py-2.5 text-sm outline-none focus:border-ouro" />
              <button onClick={() => set('opcoes', r.opcoes.filter((_, k) => k !== i))} className="px-2 text-c1">✕</button>
            </div>
          ))}
          <button onClick={() => set('opcoes', [...r.opcoes, { nome: '', extra: 0 }])} className="text-sm font-semibold text-c1">+ Adicionar opção</button>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={r.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Disponível no cardápio</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={r.destaque} onChange={(e) => set('destaque', e.target.checked)} /> Destaque (★)</label>
        </div>

        <div className="mt-4 flex gap-2">
          {r.id && <button onClick={apagar} className="rounded-xl border-[1.5px] border-c1 px-4 py-3 text-sm font-bold text-c1">Apagar</button>}
          <button disabled={salvando || enviandoFoto} onClick={salvar} className="flex-1 rounded-xl bg-verde py-3 font-bold text-white">{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </>
  )
}
