import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { erroMsg } from '../lib/util'
import Pedidos from './painel/Pedidos'
import Produtos from './painel/Produtos'
import LojaConfig from './painel/LojaConfig'
import Caixa from './painel/Caixa'

type Aba = 'pedidos' | 'caixa' | 'produtos' | 'loja'

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [equipe, setEquipe] = useState<boolean | null>(null)
  const [aba, setAba] = useState<Aba>('pedidos')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setPronto(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessao) return setEquipe(null)
    supabase.rpc('eh_equipe').then(({ data }) => setEquipe(Boolean(data)))
  }, [sessao])

  if (!pronto) return <div className="flex min-h-screen items-center justify-center bg-fundo"><div className="h-8 w-8 rounded-full border-4 border-borda border-t-verde girar" /></div>
  if (!sessao) return <Login />
  if (equipe === null) return <div className="flex min-h-screen items-center justify-center bg-fundo"><div className="h-8 w-8 rounded-full border-4 border-borda border-t-verde girar" /></div>
  if (!equipe)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-fundo p-6 text-center">
        <p className="max-w-sm text-mudo">Este usuário entrou, mas ainda não foi liberado como equipe da loja. Rode o comando de liberar equipe no Supabase (está no LEIA-ME).</p>
        <button onClick={() => supabase.auth.signOut()} className="rounded-xl border border-borda bg-white px-4 py-2 font-semibold">Sair</button>
      </div>
    )

  return (
    <div className="flex h-dvh flex-col bg-fundo">
      <header className="flex flex-wrap items-center gap-3 border-b border-borda bg-white px-4 py-2.5 print:hidden">
        <img src="/logo.jpg" alt="" className="h-9 w-9 rounded-full object-cover" />
        <b className="text-[15px]">Bendito · Painel</b>
        <nav className="ml-2 flex gap-1 rounded-xl bg-fundo p-1">
          {([['pedidos', '📋 Pedidos'], ['caixa', '💰 Caixa'], ['produtos', '🍰 Produtos'], ['loja', '⚙️ Loja']] as [Aba, string][]).map(([a, t]) => (
            <button key={a} onClick={() => setAba(a)} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${aba === a ? 'bg-white text-verde shadow-sm' : 'text-mudo'}`}>{t}</button>
          ))}
        </nav>
        <button onClick={() => supabase.auth.signOut()} className="ml-auto text-xs font-semibold text-mudo">Sair</button>
      </header>
      <div className="min-h-0 flex-1">
        {aba === 'pedidos' && <Pedidos />}
        {aba === 'caixa' && <Caixa />}
        {aba === 'produtos' && <Produtos />}
        {aba === 'loja' && <LojaConfig />}
      </div>
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) setErro(error.message.includes('Invalid') ? 'E-mail ou senha incorretos.' : erroMsg(error))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-verde p-6">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-3xl bg-papel p-6 shadow-2xl">
        <img src="/logo.jpg" alt="" className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-ouro2" />
        <h1 className="mt-3 text-center font-serif text-3xl font-semibold text-verde">Painel da loja</h1>
        <p className="mb-4 text-center text-sm text-mudo">Entre para ver os pedidos</p>
        {erro && <p className="mb-2 rounded-xl bg-c1b p-2.5 text-sm text-c1">{erro}</p>}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" autoComplete="username" className="mb-2 w-full rounded-xl border border-linha bg-creme px-3.5 py-3 outline-none focus:border-ouro" />
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha" autoComplete="current-password" className="w-full rounded-xl border border-linha bg-creme px-3.5 py-3 outline-none focus:border-ouro" />
        <button disabled={enviando} className="mt-4 w-full rounded-xl bg-verde py-3.5 font-bold text-white">{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
