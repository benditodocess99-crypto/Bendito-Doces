import { lazy, Suspense } from 'react'
import { configurado } from './lib/supabase'

// cada tela baixa só o código dela (o cliente não baixa o painel e vice-versa)
const Cardapio = lazy(() => import('./pages/Cardapio'))
const Painel = lazy(() => import('./pages/Painel'))

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-creme">
      <div className="h-8 w-8 rounded-full border-4 border-salvia border-t-verde girar" />
    </div>
  )
}

export default function App() {
  if (!configurado) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 bg-creme p-6">
        <h1 className="font-serif text-3xl font-semibold text-verde">Falta configurar</h1>
        <p className="text-mudo">
          Crie o arquivo <code className="text-ouro">.env</code> na pasta do projeto (copie o{' '}
          <code className="text-ouro">.env.example</code>) com a URL e a anon key do Supabase. Depois pare e rode{' '}
          <code className="text-ouro">npm run dev</code> de novo.
        </p>
      </div>
    )
  }
  return <Suspense fallback={<Carregando />}>{window.location.pathname.startsWith('/painel') ? <Painel /> : <Cardapio />}</Suspense>
}
