// ============================================================
// OFICINAHUB — cliente API + fila offline (IndexedDB)
// ============================================================
import { openDB } from 'idb'
import { useSession } from './session'

// Sem VITE_API_URL o pedido ia para o próprio domínio e a Vercel devolvia a
// sua página 404 em HTML — dando "Unexpected token 'T'... is not valid JSON",
// que não diz nada a ninguém. Falhar alto e claro vale mais que adivinhar.
export const API = import.meta.env.VITE_API_URL || ''
export const API_EM_FALTA = !API

// ── Fetch autenticado com refresh automático ─────────────────
export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const s = useSession.getState()
  const doFetch = (token: string | null) =>
    fetch(`${API}${path}`, {
      ...opts,
      headers: {
        // Só anuncia JSON quando há mesmo um corpo — senão alguns servidores
        // recusam com "Body cannot be empty when content-type is application/json".
        ...(opts.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-App-Version': __APP_VERSION__,
        ...(opts.headers || {}),
      },
    })

  let res = await doFetch(s.accessToken)

  if (res.status === 401 && s.refreshToken) {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    })
    if (r.ok) {
      const { accessToken } = await r.json()
      useSession.getState().setSession({ accessToken })
      res = await doFetch(accessToken)
    } else {
      useSession.getState().logout()
      location.href = '/login'
      throw new Error('Sessão expirada')
    }
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erro'), { status: res.status, data })
  return data
}

// ── Fila offline em IndexedDB ────────────────────────────────
const dbp = openDB('oficinahub-offline', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('queue'))
      db.createObjectStore('queue', { keyPath: 'offlineId' })
    if (!db.objectStoreNames.contains('photos'))
      db.createObjectStore('photos', { keyPath: 'key' })
  },
})

export const offline = {
  async enqueueReception(payload: Record<string, unknown>): Promise<string> {
    const offlineId = crypto.randomUUID()
    const db = await dbp
    await db.put('queue', {
      offlineId, entityType: 'reception', payload,
      createdAt: new Date().toISOString(),
      attempts: 0, lastError: null,       // para não tentar em ciclo eterno em silêncio
    })
    return offlineId
  },

  async savePhotoBlob(offlineId: string, zone: string, blob: Blob, meta: any) {
    const db = await dbp
    await db.put('photos', { key: `${offlineId}:${zone}:${Date.now()}`, offlineId, zone, blob, meta })
  },

  async pendingCount(): Promise<number> {
    const db = await dbp
    return db.count('queue')
  },

  // O que está preso na fila, para se poder ver e agir — em vez de um
  // contador cego que só diz "há qualquer coisa por sincronizar".
  async listQueue(): Promise<any[]> {
    const db = await dbp
    const items = await db.getAll('queue')
    const fotos = await db.getAll('photos')
    return items.map((i: any) => ({
      offlineId: i.offlineId,
      cliente: (i.payload?.customer?.fullName) || (i.payload?.customer?.id ? 'Cliente existente' : '—'),
      matricula: i.payload?.vehicle?.plate || '—',
      createdAt: i.createdAt,
      attempts: i.attempts || 0,
      lastError: i.lastError || null,
      fotos: fotos.filter((p: any) => p.offlineId === i.offlineId).length,
    }))
  },

  // Descartar uma entrada presa que não há forma de enviar (payload velho
  // e irreparável). Decisão consciente do utilizador, com aviso.
  async discardQueued(offlineId: string) {
    const db = await dbp
    const fotos = await db.getAll('photos')
    for (const p of fotos.filter((x: any) => x.offlineId === offlineId))
      await db.delete('photos', p.key)
    await db.delete('queue', offlineId)
  },

  async syncAll(): Promise<{ ok: number; failed: number }> {
    const db = await dbp
    const items = await db.getAll('queue')
    if (!items.length) return { ok: 0, failed: 0 }

    const res = await api('/api/v1/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        items: items.map(i => ({
          offlineId: i.offlineId, entityType: i.entityType, payload: i.payload,
        })),
      }),
    })

    let ok = 0, failed = 0
    for (const r of res.results) {
      if (r.status === 'ok') {
        // Enviar fotos guardadas offline desta JO
        const allPhotos = await db.getAll('photos')
        const mine = allPhotos.filter((p: any) => p.offlineId === r.offlineId)
        for (const p of mine) {
          try {
            await uploadPhoto(r.joId, p.zone, p.blob, p.meta)
            await db.delete('photos', p.key)
          } catch { /* fica para a próxima sync */ }
        }
        await db.delete('queue', r.offlineId)
        ok++
      } else {
        // Não apaga (a JO não foi criada), mas regista o erro e conta a
        // tentativa — para deixar de tentar em silêncio e poder mostrar-se
        // ao utilizador o que está preso e porquê.
        const item = await db.get('queue', r.offlineId)
        if (item) {
          item.attempts = (item.attempts || 0) + 1
          item.lastError = r.error || 'Erro desconhecido'
          await db.put('queue', item)
        }
        failed++
      }
    }
    return { ok, failed }
  },
}

// ── Upload de foto: pede URL assinada e envia directo ao Storage ──
export async function uploadPhoto(
  joId: string, zone: string, blob: Blob,
  meta: { isRequired?: boolean; latitude?: number; longitude?: number } = {}
) {
  const presign = await api(`/api/v1/receptions/${joId}/photos/presign`, {
    method: 'POST',
    body: JSON.stringify({ zone, ...meta, contentType: blob.type || 'image/jpeg' }),
  })
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!put.ok) throw new Error('Upload falhou')
  return presign.photoId
}

// ── Auto-sync ao recuperar ligação ───────────────────────────
export function startAutoSync(onSynced?: (r: { ok: number; failed: number }) => void) {
  const trySync = async () => {
    if (!navigator.onLine) return
    const count = await offline.pendingCount()
    if (count === 0) return
    try {
      const result = await offline.syncAll()
      onSynced?.(result)
    } catch { /* tenta na próxima */ }
  }
  window.addEventListener('online', trySync)
  setInterval(trySync, 60_000)   // tenta a cada minuto
  trySync()
}
