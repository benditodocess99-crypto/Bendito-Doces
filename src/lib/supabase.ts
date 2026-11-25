import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export const configurado = Boolean(url && key && !url.includes('SEU-PROJETO'))

export const supabase = createClient(url || 'http://localhost:54321', key || 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Loja = {
  id: number
  nome: string
  endereco: string | null
  whatsapp: string | null
  aberto: boolean
  aceita_entrega: boolean
  aceita_retirada: boolean
  aceita_mesa: boolean
  mesas: number
  taxa_entrega: number
  pedido_minimo: number
  tempo_entrega: string
  tempo_retirada: string
  aviso: string | null
}

export type Categoria = { id: string; nome: string; icone: string | null; ordem: number; ativo: boolean }

export type Opcao = { nome: string; extra: number }

export type Produto = {
  id: string
  categoria_id: string
  nome: string
  descricao: string | null
  preco: number
  preco_de: number | null
  foto_url: string | null
  opcoes: Opcao[]
  ativo: boolean
  destaque: boolean
  ordem: number
}

export type ItemPedido = { produto_id: string; nome: string; opcao: string | null; obs: string; qtd: number; preco: number }

export type StatusPedido = 'analise' | 'preparo' | 'pronto' | 'entrega' | 'final' | 'recusado'
export type TipoPedido = 'entrega' | 'retirada' | 'mesa'
export type FormaPagamento = 'pix' | 'cartao' | 'dinheiro'

export type Pedido = {
  id: string
  numero: number
  criado_em: string
  atualizado_em: string
  status: StatusPedido
  tipo: TipoPedido
  mesa: number | null
  origem: string
  cliente_nome: string
  cliente_whatsapp: string | null
  endereco: string | null
  observacao: string | null
  itens: ItemPedido[]
  subtotal: number
  taxa: number
  total: number
  forma_pagamento: FormaPagamento
  troco_para: number | null
  pago: boolean
  motivo_recusa: string | null
}

// o Supabase devolve numeric como texto em alguns casos; isso garante número
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
  return Number.isFinite(n) ? n : 0
}
