import { supabase } from './supabase'

// chave PÚBLICA das notificações (pode ficar no código; a privada fica só no banco)
const VAPID = 'BAY3fo9MvO7Qs1alUvyuuKFvqBddk2diLfrWDfIvS-e_0wcisiqOt5o76IfivlOBGzA-9g6PndLe8G2O5VkC6bc'
const FUNCAO = (import.meta.env.VITE_SUPABASE_URL as string) + '/functions/v1/whatsapp-pedido'

export type EstadoPush = 'verificando' | 'ativo' | 'inativo' | 'instalar' | 'bloqueado' | 'sem_suporte'

export const temNotificacao = () => typeof window !== 'undefined' && 'Notification' in window
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && temNotificacao()

function chave(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function salvar(sub: PushSubscription) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('salvar_inscricao_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh ?? '',
    p_auth: j.keys?.auth ?? '',
    p_aparelho: navigator.userAgent,
  })
  if (error) throw error
}

export async function verificarPush(): Promise<EstadoPush> {
  if (!suportado()) return ehIOS() && !instalado() ? 'instalar' : 'sem_suporte'
  if (Notification.permission === 'denied') return 'bloqueado'
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const sub = await reg.pushManager.getSubscription()
    if (sub && Notification.permission === 'granted') {
      await salvar(sub)
      return 'ativo'
    }
  } catch {
    return 'sem_suporte'
  }
  return 'inativo'
}

export async function ativarPush(): Promise<EstadoPush> {
  if (!suportado()) return ehIOS() && !instalado() ? 'instalar' : 'sem_suporte'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'bloqueado' : 'inativo'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave(VAPID) }))
  await salvar(sub)
  return 'ativo'
}

export async function desligarPush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await supabase.rpc('remover_inscricao_push', { p_endpoint: sub.endpoint })
      await sub.unsubscribe()
    }
  } catch {
    /* nada */
  }
}

export async function testarPush() {
  const reg = await navigator.serviceWorker?.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return 0
  const r = await fetch(FUNCAO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'teste_push', endpoint: sub.endpoint }) })
  const j = await r.json().catch(() => ({}))
  return (j as { enviados?: number }).enviados ?? 0
}
