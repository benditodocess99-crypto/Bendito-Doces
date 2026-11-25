export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const PAGAMENTO: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' }
export const ORIGEM: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', mesa: 'Mesa', site: 'Site' }

export function mascaraFone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function foneBonito(v: string | null) {
  if (!v) return ''
  let d = v.replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return mascaraFone(d)
}

export function haQuanto(iso: string, agora = Date.now()) {
  const m = Math.floor((agora - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  return `há ${h}h${m % 60 ? ` ${m % 60}min` : ''}`
}

export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function erroMsg(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Algo deu errado. Tente de novo.'
}

// ---------- som (Web Audio, sem arquivo) ----------
let ctx: AudioContext | null = null
export function liberarSom() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* navegador sem áudio */
  }
}
export function tocar(notas: number[], volume = 0.25) {
  try {
    liberarSom()
    if (!ctx) return
    notas.forEach((f, i) => {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(g)
      g.connect(ctx!.destination)
      const t = ctx!.currentTime + i * 0.16
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(volume, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
      o.start(t)
      o.stop(t + 0.42)
    })
  } catch {
    /* ignora */
  }
}
