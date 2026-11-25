import { configurado } from './lib/supabase'
import Cardapio from './pages/Cardapio'
import Painel from './pages/Painel'

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
  return window.location.pathname.startsWith('/painel') ? <Painel /> : <Cardapio />
}
