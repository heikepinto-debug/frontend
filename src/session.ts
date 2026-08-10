// ============================================================
// OFICINAHUB — store de sessão + branding dinâmico (white-label)
// Após login, aplica as cores e logo do tenant à interface toda
// ============================================================
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Tenant {
  id: string; slug: string; name: string
  logoUrl: string | null
  brandPrimary: string          // ex: #6B8C2A (FIT)
  brandSecondary: string        // ex: #4D4D4D
  settings: Record<string, unknown>
  modules: string[]             // ['M1', ...] — módulos comprados
}

interface Session {
  accessToken: string | null
  refreshToken: string | null
  lastActivity: number          // timestamp da última actividade (para timeout)
  user: { id: string; name: string; email: string; platformAdmin?: boolean } | null
  roles: string[]
  permissions: string[]
  tenant: Tenant | null

  setSession: (s: Partial<Session>) => void
  logout: () => void
  touch: () => void                          // regista actividade
  checkTimeout: () => boolean                // true se expirou (e faz logout)
  lockedByTimeout: boolean                   // último logout foi por inatividade?
  clearLockFlag: () => void
  can: (perm: string) => boolean
  hasModule: (code: string) => boolean
}

export const useSession = create<Session>()(
  persist(
    (set, get) => ({
      accessToken: null, refreshToken: null, lastActivity: Date.now(),
      user: null, roles: [], permissions: [], tenant: null,
      lockedByTimeout: false,

      clearLockFlag: () => set({ lockedByTimeout: false }),

      setSession: (s) => {
        set({ ...s, lastActivity: Date.now(), lockedByTimeout: false } as any)
        if (s.tenant) applyBranding(s.tenant as Tenant)
      },

      logout: () => {
        set({ accessToken: null, refreshToken: null, user: null,
              roles: [], permissions: [], tenant: null })
        resetBranding()
      },

      can: (perm) => {
        const p = get().permissions
        if (p.includes('*')) return true
        if (p.includes(perm)) return true
        const [domain] = perm.split(':')
        return p.includes(`${domain}:*`)
      },

      hasModule: (code) => get().tenant?.modules?.includes(code) ?? false,

      touch: () => { if (get().accessToken) set({ lastActivity: Date.now() }) },

      checkTimeout: () => {
        // Tablet partilhado no chão da oficina: 20 min de inatividade
        // bloqueia a sessão. Curto o suficiente para o dispositivo não
        // ficar aberto se alguém lhe pega, longo o suficiente para não
        // chatear quem está a trabalhar.
        const TIMEOUT = 20 * 60 * 1000   // 20 minutos de inatividade
        const { accessToken, lastActivity } = get()
        if (accessToken && Date.now() - lastActivity > TIMEOUT) {
          get().logout()
          set({ lockedByTimeout: true })
          return true
        }
        return false
      },
    }),
    {
      name: 'oficinahub-session',
      onRehydrateStorage: () => (state) => {
        // Reaplica o branding do tenant ao recarregar a página
        if (state?.tenant) applyBranding(state.tenant)
      },
    }
  )
)

// ── Aplica as cores do tenant como CSS variables globais ────
export function applyBranding(t: Tenant) {
  const root = document.documentElement
  root.style.setProperty('--brand', t.brandPrimary)
  root.style.setProperty('--brand-dark', shade(t.brandPrimary, -25))
  root.style.setProperty('--brand-light', shade(t.brandPrimary, 20))
  root.style.setProperty('--brand-bg', tint(t.brandPrimary, 0.92))
  root.style.setProperty('--brand-border', tint(t.brandPrimary, 0.6))
  root.style.setProperty('--brand-2', t.brandSecondary)
  document.title = `${t.name} · OficinaHub`
}

function resetBranding() {
  const root = document.documentElement
  ;['--brand','--brand-dark','--brand-light','--brand-bg','--brand-border','--brand-2']
    .forEach(v => root.style.removeProperty(v))
  document.title = 'OficinaHub'
}

// Utils de cor: escurecer/clarear hex
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16)
  const amt = Math.round(2.55 * pct)
  const r = Math.min(255, Math.max(0, (n >> 16) + amt))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt))
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
function tint(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * factor)
  const g = Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * factor)
  const b = Math.round((n & 0xff) + (255 - (n & 0xff)) * factor)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
