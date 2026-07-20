// ============================================================
// OFICINAHUB — App principal
// Login = marca OficinaHub · Após login = marca do tenant
// Recepção blindada: câmara real, GPS real, assinatura, offline
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { useSession } from './session'
import { api, offline, uploadPhoto, startAutoSync, API, API_EM_FALTA } from './api'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'

// ── Actualização da aplicação ────────────────────────────────
// Sem isto o service worker nunca é registado nem verificado: quem
// deixa o separador aberto (toda a gente, no telemóvel) fica preso a
// uma versão antiga para sempre — a testar código que já não existe.
// Verifica-se a cada 20 minutos e sempre que a app volta à frente.
let aplicarUpdate: ((recarregar?: boolean) => void) | null = null
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (!r) return
    const verificar = () => { if (navigator.onLine) r.update().catch(() => {}) }
    setInterval(verificar, 20 * 60 * 1000)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) verificar() })
  },
  onNeedRefresh() {
    aplicarUpdate = updateSW
    window.dispatchEvent(new CustomEvent('oh:update-pronto'))
  },
})

// ────────────────────────────────────────────────────────────
// LOGIN — marca OficinaHub (neutra); tenant branding vem depois
// ────────────────────────────────────────────────────────────
function Login() {
  const setSession = useSession(s => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      if (API_EM_FALTA) throw new Error('Configuração em falta: VITE_API_URL não foi definida no build. Avisa quem faz o deploy — não é problema da tua senha.')
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha no login')
      setSession(data)
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="gh-logo">
          <div className="gh-mark">
            <svg width="30" height="30" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="44" cy="44" r="40" fill="none" stroke="#fff" strokeWidth="9"/>
              <line x1="30" y1="30" x2="30" y2="58" stroke="#fff" strokeWidth="9" strokeLinecap="round"/>
              <line x1="58" y1="30" x2="58" y2="58" stroke="#fff" strokeWidth="9" strokeLinecap="round"/>
              <line x1="30" y1="44" x2="58" y2="44" stroke="#fff" strokeWidth="9" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="gh-name">OficinaHub</div>
            <div className="gh-sub">Gestão de oficinas</div>
          </div>
        </div>
        <form onSubmit={submit}>
          <label className="fl">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nome@oficina.com" autoComplete="email" required />
          <label className="fl" style={{ marginTop: 16 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password" required />
          {err && <div className="err-box">{err}</div>}
          <button className="btn-primary" disabled={busy} style={{ marginTop: 22, width: '100%', justifyContent: 'center' }}>
            {busy ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </div>
      <div className="login-footer">OficinaHub · gestão modular para oficinas</div>
    </div>
  )
}

function Shell() {
  const { tenant, user, logout } = useSession()
  const canDo = useSession(s => s.can)
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [temUpdate, setTemUpdate] = useState(false)   // há versão nova à espera
  const [view, setView] = useState<'home' | 'reception' | 'list' | 'tasks' | 'detail' | 'bookings' | 'os' | 'authorizations' | 'errorlogs' | 'sign' | 'password' | 'complete' | 'queue' | 'servicetypes' | 'reception-quick' | 'ppi'>('home')
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [osId, setOsId] = useState<string | undefined>(undefined)
  const [ppiJoId, setPpiJoId] = useState<string | null>(null)
  const [osReturnTo, setOsReturnTo] = useState<'list' | 'authorizations' | 'detail'>('list')
  const [signId, setSignId] = useState<string | undefined>(undefined)
  const [completeId, setCompleteId] = useState<string | undefined>(undefined)
  const [bookingCount, setBookingCount] = useState(0)
  const [authCount, setAuthCount] = useState(0)
  const isOwner = canDo('jobdelete:any')

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    startAutoSync(() => offline.pendingCount().then(setPending))
    const t = setInterval(() => offline.pendingCount().then(setPending), 5000)
    // Versão nova disponível.
    const up = () => setTemUpdate(true)
    window.addEventListener('oh:update-pronto', up)
    return () => {
      window.removeEventListener('online', on); window.removeEventListener('offline', off)
      window.removeEventListener('oh:update-pronto', up); clearInterval(t)
    }
  }, [])

  const [summary, setSummary] = useState<any>(null)
  const [navOpen, setNavOpen] = useState(false)  // menu no telemóvel

  // Ecrãs onde recarregar destrói trabalho não enviado (fotos e assinatura
  // vivem só na memória até subirem). Em qualquer outro, actualiza-se sozinho.
  const ECRAS_ARRISCADOS = ['reception', 'complete', 'sign']
  useEffect(() => {
    if (!temUpdate) return
    if (ECRAS_ARRISCADOS.includes(view)) return    // espera que ele saia daqui
    // Fora de perigo: aplica agora, sem perguntar. Um segundo de espera
    // vale mais do que alguém a trabalhar semanas com código velho.
    const t = setTimeout(() => window.location.reload(), 1200)
    return () => clearTimeout(t)
  }, [temUpdate, view])

  // Contadores e resumo do painel — actualiza ao voltar ao início
  useEffect(() => {
    if (view === 'home') {
      api('/api/v1/bookings').then(r => {
        const now = new Date(); now.setHours(23, 59, 59, 999)
        const relevant = (r.data || []).filter((b: any) => new Date(b.booking_date) <= now)
        setBookingCount(relevant.length)
      }).catch(() => {})
      api('/api/v1/os/awaiting-authorization').then(r => setAuthCount((r.data || []).length)).catch(() => {})
      api('/api/v1/dashboard/summary').then(setSummary).catch(() => {})
    }
  }, [view])

  const nav = (v: string, label: string, icon: string, count?: number, badge = false) => ({
    v, label, icon, count, badge,
  })
  const navItems = [
    nav('home', 'Painel', 'ti-layout-dashboard'),
    canDo('reception:create') && nav('reception', 'Nova recepção', 'ti-plus'),
    canDo('reception:create') && nav('reception-quick', 'Entrada rápida', 'ti-bolt'),
    canDo('reception:read') && nav('list', 'Recepções', 'ti-list-details', summary?.inShop),
    authCount > 0 && nav('authorizations', 'Autorizações', 'ti-clipboard-check', authCount, true),
    canDo('reception:create') && nav('bookings', 'Marcações', 'ti-calendar-event', bookingCount || undefined, bookingCount > 0),
    nav('tasks', 'Tarefas', 'ti-checklist'),
    canDo('config:manage') && nav('servicetypes', 'Tipos de serviço', 'ti-tool'),
  ].filter(Boolean) as any[]

  const go = (v: string) => { setView(v as any); setNavOpen(false) }

  return (
    <div className="app-shell">
      {temUpdate && (
        <div className="update-bar" role="status">
          <i className="ti ti-refresh" aria-hidden="true"></i>
          <span>{ECRAS_ARRISCADOS.includes(view)
            ? 'Há uma versão nova. Termina o que estás a fazer — actualiza sozinha quando saíres deste ecrã.'
            : 'A actualizar para a versão nova…'}</span>
          {ECRAS_ARRISCADOS.includes(view) && (
            <button onClick={() => { if (confirm('Actualizar agora? Perdes o que ainda não foi enviado.')) window.location.reload() }}>
              Actualizar já
            </button>
          )}
        </div>
      )}
      {/* Sidebar (PC/tablet fixa; telemóvel abre por cima) */}
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          {tenant?.logoUrl
            ? <img src={tenant.logoUrl} alt="" className="sidebar-logo" />
            : <div className="tenant-logo-fallback">{tenant?.name?.[0]}</div>}
          <div className="sidebar-brand-text">
            <div className="tenant-name">{tenant?.name}</div>
            <div className="tenant-powered">OficinaHub</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(it => (
            <button key={it.v} className={`nav-item ${view === it.v ? 'active' : ''}`} onClick={() => go(it.v)}>
              <i className={`ti ${it.icon}`} aria-hidden="true"></i>
              <span className="nav-label">{it.label}</span>
              {it.count != null && it.count > 0 && <span className={`nav-count ${it.badge ? 'badge' : ''}`}>{it.count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-ver" title="Versão desta aplicação"><strong>{__APP_PACKAGE__}</strong> · {__APP_VERSION__}</div>
          <button className={`nav-item ${view === 'password' ? 'active' : ''}`} onClick={() => go('password')}>
            <i className="ti ti-key" aria-hidden="true"></i><span className="nav-label">A minha senha</span>
          </button>
          {isOwner && (
            <button className={`nav-item ${view === 'errorlogs' ? 'active' : ''}`} onClick={() => go('errorlogs')}>
              <i className="ti ti-bug" aria-hidden="true"></i><span className="nav-label">Diagnóstico</span>
            </button>
          )}
          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name}</div>
              {!online && <span className="offline-pill">Offline{pending > 0 ? ` · ${pending}` : ''}</span>}
              {online && pending > 0 && <button className="sync-pill" onClick={() => setView('queue')} title="Ver o que está por sincronizar">A sincronizar {pending}…</button>}
            </div>
            <button className="btn-ghost btn-sm" onClick={logout} title="Sair"><i className="ti ti-logout" aria-hidden="true"></i></button>
          </div>
        </div>
      </aside>

      {/* Área de conteúdo */}
      <div className="content-area">
        <header className="mobile-topbar">
          <button className="btn-ghost btn-sm" onClick={() => setNavOpen(true)}><i className="ti ti-menu-2" aria-hidden="true"></i></button>
          <div className="tenant-name">{tenant?.name}</div>
          <span style={{ width: 32 }} />
        </header>

      {view === 'home' && (
        <main className="dash home-bg">
          <div className="dash-head">
            <div>
              <h1>Olá, {user?.name?.split(' ')[0]}</h1>
              <p className="dash-date">{new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </div>

          {/* Painel de relance */}
          <div className="stat-grid">
            <button className="stat-card accent" onClick={() => setView('list')}>
              <div className="stat-num">{summary?.inShop ?? '–'}</div>
              <div className="stat-label">Carros na oficina</div>
            </button>
            <button className="stat-card" onClick={() => setView('list')}>
              <div className="stat-num">{summary?.diagnosing ?? '–'}</div>
              <div className="stat-label">Em diagnóstico</div>
            </button>
            <button className="stat-card" onClick={() => setView('list')}>
              <div className="stat-num">{summary?.working ?? '–'}</div>
              <div className="stat-label">Em trabalho</div>
            </button>
            <button className="stat-card ok" onClick={() => setView('list')}>
              <div className="stat-num">{summary?.ready ?? '–'}</div>
              <div className="stat-label">Prontos a levantar</div>
            </button>
            {canDo('reception:create') && (
              <button className="stat-card" onClick={() => setView('bookings')}>
                <div className="stat-num">{summary?.bookingsToday ?? '–'}</div>
                <div className="stat-label">Marcações hoje</div>
              </button>
            )}
            {authCount > 0 && (
              <button className="stat-card warn" onClick={() => setView('authorizations')}>
                <div className="stat-num">{summary?.pendingAuth ?? authCount}</div>
                <div className="stat-label">Autorizações pendentes</div>
              </button>
            )}
          </div>

          {/* Acções rápidas */}
          <div className="dash-section-title">Acções</div>
          <div className="quick-actions">
            {canDo('reception:create') && (
              <button className="quick-card" onClick={() => { setResumeDraftId(undefined); setView('reception') }}>
                <i className="ti ti-plus" aria-hidden="true"></i>
                <span>Nova recepção</span>
              </button>
            )}
            {canDo('reception:create') && (
              <button className="quick-card" onClick={() => { setResumeDraftId(undefined); setView('reception-quick') }}>
                <i className="ti ti-bolt" aria-hidden="true"></i>
                <span>Entrada rápida</span>
              </button>
            )}
            {canDo('reception:read') && (
              <button className="quick-card" onClick={() => setView('list')}>
                <i className="ti ti-list-details" aria-hidden="true"></i>
                <span>Ver carros</span>
              </button>
            )}
            {authCount > 0 && (
              <button className="quick-card" onClick={() => setView('authorizations')}>
                <i className="ti ti-clipboard-check" aria-hidden="true"></i>
                <span>Autorizar diagnósticos</span>
                <span className="quick-badge">{authCount}</span>
              </button>
            )}
            {canDo('reception:create') && (
              <button className="quick-card" onClick={() => setView('bookings')}>
                <i className="ti ti-calendar-event" aria-hidden="true"></i>
                <span>Marcações</span>
                {bookingCount > 0 && <span className="quick-badge">{bookingCount}</span>}
              </button>
            )}
            <button className="quick-card" onClick={() => setView('tasks')}>
              <i className="ti ti-checklist" aria-hidden="true"></i>
              <span>Tarefas</span>
            </button>
          </div>
        </main>
      )}
      {view === 'reception' && <Reception key={resumeDraftId || 'new'} resumeDraftId={resumeDraftId} onDone={() => { setResumeDraftId(undefined); setView('list') }} onBack={() => { setResumeDraftId(undefined); setView('home') }} />}
      {view === 'reception-quick' && <Reception key="quick" quick onDone={() => { setView('list') }} onBack={() => setView('home')} />}
      {view === 'ppi' && ppiJoId && <PPICircuit joId={ppiJoId} onBack={() => setView('list')} />}
      {view === 'list' && <ReceptionList onBack={() => setView('home')} onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} onOpen={(id: string) => { setDetailId(id); setView('detail') }} isOwner={isOwner} onOpenOS={(id: string) => { setOsId(id); setOsReturnTo('list'); setView('os') }}
        onOpenPPI={(id: string) => { setPpiJoId(id); setView('ppi') }}
        onSign={(id: string) => { setSignId(id); setView('sign') }}
        onComplete={(id: string) => { setCompleteId(id); setView('complete') }} />}
      {view === 'detail' && detailId && <ReceptionDetail joId={detailId} onBack={() => setView('list')}
        onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} isOwner={isOwner}
        onOpenOther={(id: string) => setDetailId(id)}
        onOpenOS={(id: string) => { setOsId(id); setOsReturnTo('detail'); setView('os') }} />}
      {view === 'bookings' && <Bookings onBack={() => setView('home')} onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} />}
      {view === 'os' && osId && <OrderService joId={osId} onBack={() => setView(osReturnTo)} myId={user?.id || ''} isOwner={isOwner} onOpenEntry={(id: string) => { setDetailId(id); setView('detail') }} />}
      {view === 'authorizations' && <Authorizations onBack={() => setView('home')} onOpen={(id: string) => { setOsId(id); setOsReturnTo('authorizations'); setView('os') }} />}
      {view === 'sign' && signId && <CompleteSignature joId={signId} onBack={() => setView('list')} onDone={() => { setSignId(undefined); setView('list') }} />}
      {view === 'complete' && completeId && <CompleteEntry joId={completeId} onBack={() => setView('list')} onDone={() => { setCompleteId(undefined); setView('list') }} />}
      {view === 'queue' && <SyncQueue onBack={() => setView('home')} />}
      {view === 'servicetypes' && <ServiceTypes onBack={() => setView('home')} />}
      {view === 'password' && <ChangePassword onBack={() => setView('home')} />}
      {view === 'errorlogs' && <ErrorLogs onBack={() => setView('home')} />}
      {view === 'tasks' && <Tasks onBack={() => setView('home')} isOwner={isOwner} myId={user?.id || ''} />}

      {/* Botão flutuante — nova recepção sempre à mão no telemóvel/tablet */}
      {canDo('reception:create') && view !== 'reception' && (
        <button className="fab" onClick={() => { setResumeDraftId(undefined); setView('reception') }} title="Nova recepção" aria-label="Nova recepção">
          <i className="ti ti-plus" aria-hidden="true"></i>
        </button>
      )}
      </div>
    </div>
  )
}

const REQ_ZONES = [
  { key: 'front', label: 'Frente' }, { key: 'rear', label: 'Traseira' },
  { key: 'left', label: 'Lado esq.' }, { key: 'right', label: 'Lado dir.' },
  { key: 'roof', label: 'Tecto' }, { key: 'interior', label: 'Interior' },
]
// Rodas — obrigatórias, porcas em detalhe (prova contra reclamações).
const WHEEL_ZONES = [
  { key: 'wheel_fl', label: 'Roda frente esq.', hint: 'Porcas em detalhe' },
  { key: 'wheel_fr', label: 'Roda frente dir.', hint: 'Porcas em detalhe' },
  { key: 'wheel_rl', label: 'Roda trás esq.', hint: 'Porcas em detalhe' },
  { key: 'wheel_rr', label: 'Roda trás dir.', hint: 'Porcas em detalhe' },
]
// Bateria — obrigatória, com a referência registada.
const BATTERY_ZONE = { key: 'battery', label: 'Bateria', hint: 'Mostra a marca/referência' }
// Fotos do painel — obrigatórias. Documentam o estado eléctrico à entrada.
const DASH_ZONES = [
  { key: 'dash_ign', label: 'Painel: ignição ON, motor OFF', hint: 'Mostra as luzes de aviso acesas' },
  { key: 'dash_run', label: 'Painel: motor ON', hint: 'O que fica aceso a trabalhar' },
  { key: 'km', label: 'Conta-km em foco', hint: 'Leitura clara dos quilómetros' },
]
// Todas as zonas obrigatórias, por ordem — serve o formulário e a vista de
// detalhe. Construído das listas acima, para nunca ficar desactualizado.
const ALL_ZONES = [...REQ_ZONES, ...WHEEL_ZONES, BATTERY_ZONE, ...DASH_ZONES]
const ZONE_LABEL: Record<string, string> = Object.fromEntries(ALL_ZONES.map(z => [z.key, z.label]))
const zoneName = (zona: string) =>
  ZONE_LABEL[zona] || (zona?.startsWith('damage-') ? 'Dano registado' : zona)
const REQ_TOTAL = REQ_ZONES.length + WHEEL_ZONES.length + 1 + DASH_ZONES.length   // 14 fotos obrigatórias

// Sistemas verificados à entrada (estado como chegou)
const SYSTEM_CHECKS = [
  'Ar condicionado', 'Aquecimento', 'Piscas', 'Médios / Máximos', 'Luzes de travão',
  'Buzina', 'Vidros eléctricos', 'Som / Rádio', 'Limpa-vidros', 'Fechos / Alarme',
]
const CHECKLIST = ['Livrete / documentos','Chaves entregues','Triângulo + colete',
  'Pneu suplente + macaco','Rádio com código','Tapetes originais']

// Zonas de dano por categoria (mapa de cima + zonas que não se veem de cima)
const DMG_GROUPS: { group: string; icon: string; zones: string[] }[] = [
  { group: 'Carroçaria', icon: 'ti-car', zones: ['Frente','Traseira','Lado esq.','Lado dir.','Tejadilho','Capô','Porta-bagagens'] },
  { group: 'Vidros', icon: 'ti-windmill', zones: ['Pára-brisas','Vidro traseiro','Vidro esq.','Vidro dir.','Espelhos'] },
  { group: 'Jantes/Pneus', icon: 'ti-brand-tabler', zones: ['Jante diant. esq.','Jante diant. dir.','Jante tras. esq.','Jante tras. dir.'] },
  { group: 'Faróis', icon: 'ti-bulb', zones: ['Farol esq.','Farol dir.','Farolim esq.','Farolim dir.'] },
  { group: 'Interior', icon: 'ti-armchair', zones: ['Bancos','Tablier','Volante','Tecto interior','Forra das portas'] },
  { group: 'Mecânica', icon: 'ti-engine', zones: ['Motor','Escape','Suspensão','Fugas'] },
]

interface Damage { id: string; area: string; note: string; photo: Blob | null }

// Formata número no estilo local (1000 → 1.000)
const MZmt = (n: number): string => new Intl.NumberFormat('pt-PT').format(n)

// Converte um Blob para base64 (sem prefixo data-url)
const blobToBase64 = (b: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1])
  r.onerror = rej
  r.readAsDataURL(b)
})

// Comprime uma foto antes de enviar: redimensiona para no máx. 1600px no lado
// maior e recomprime a JPEG 78%. Reduz ~90% do tamanho mantendo legível a
// matrícula, as porcas e a referência da bateria. Se falhar, devolve o original.
// Comprime uma foto antes de enviar. Como a lentidão da finalização foi resolvida
// (o PDF deixou de ser gerado nesse momento), já não precisamos de comprimir de
// forma agressiva. Privilegiamos a QUALIDADE: 2000px no lado maior e JPEG 88%.
// Reduz bastante um ficheiro grande (8MB → ~1.5MB) mantendo nítidas a matrícula,
// as porcas e a referência da bateria. Se falhar, devolve o original.
const compressImage = (blob: Blob, maxSide = 2000, quality = 0.88): Promise<Blob> =>
  new Promise((resolve) => {
    try {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxSide || height > maxSide) {
          if (width >= height) { height = Math.round(height * maxSide / width); width = maxSide }
          else { width = Math.round(width * maxSide / height); height = maxSide }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(blob)
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (out) => resolve(out && out.size < blob.size ? out : blob),
          'image/jpeg', quality
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob) }
      img.src = url
    } catch { resolve(blob) }
  })

// ── Validações refinadas (premium: ajudam, não bloqueiam à toa) ──
const V = {
  // Telemóvel internacional: aceita qualquer país. Só exige dígitos suficientes.
  // (7 a 15 dígitos — norma E.164 — com + / espaços / hífens / parênteses opcionais)
  phone: (v: string) => {
    const digits = v.replace(/[^\d]/g, '')
    return digits.length >= 7 && digits.length <= 15
  },
  // Matrícula: aceita qualquer formato do mundo. Só exige um mínimo.
  plate: (v: string) => v.trim().replace(/\s/g, '').length >= 3,
  email: (v: string) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  year: (v: string) => { const y = Number(v); return !v || (y >= 1950 && y <= new Date().getFullYear() + 1) },
  km: (v: string) => { const k = Number(v); return k >= 0 && k < 2_000_000 },
}


function Reception({ onDone, onBack, resumeDraftId, quick }: { onDone: () => void; onBack: () => void; resumeDraftId?: string; quick?: boolean }) {
  const tenant = useSession(s => s.tenant)
  const [step, setStep] = useState(0)
  // Entrada rápida: só o essencial — cliente, viatura, serviços, km, assinatura.
  // Salta o estado detalhado, os danos e as 14 fotos. Serve PPI, diagnóstico e
  // serviços rápidos, onde a ficha completa seria redundante.
  const STEPS = quick ? [0, 1, 2, 6] : [0, 1, 2, 3, 4, 5, 6]
  const goNext = () => { const i = STEPS.indexOf(step); if (i < STEPS.length - 1) setStep(STEPS[i + 1]) }
  const goBack = () => { const i = STEPS.indexOf(step); if (i > 0) setStep(STEPS[i - 1]) }
  const [units, setUnits] = useState<any[]>([])
  const [terms, setTerms] = useState<any>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [draftId, setDraftId] = useState<string | null>(resumeDraftId || null)
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [bookingDate, setBookingDate] = useState('')     // marcação do cliente (opcional)

  const [custSearch, setCustSearch] = useState('')
  const [custResults, setCustResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [existingCust, setExistingCust] = useState<any>(null)
  const [newCust, setNewCust] = useState(false)
  const [custName, setCustName] = useState(''); const [custPhone, setCustPhone] = useState('')
  const [custEmail, setCustEmail] = useState('')

  const [custVehicles, setCustVehicles] = useState<any[]>([])
  const [existingVeh, setExistingVeh] = useState<any>(null)
  const [newVeh, setNewVeh] = useState(false)
  const [plate, setPlate] = useState(''); const [brand, setBrand] = useState('')
  const [model, setModel] = useState(''); const [vyear, setVyear] = useState('')
  const [vin, setVin] = useState('')                                        // identidade permanente do carro
  const [isNonRunner, setIsNonRunner] = useState(false)                     // entrou sem funcionar
  const [entryPending, setEntryPending] = useState(false)                   // KM e painel ficam para depois
  const [erroFinal, setErroFinal] = useState<{ joId: string; numero: string; msg: string } | null>(null)
  const [pendingReason, setPendingReason] = useState('')                    // porquê — escrito à mão, de propósito
  const [nonRunnerTerms, setNonRunnerTerms] = useState<any>(null)           // texto dos T&C do non-runner
  const [nonRunnerAccepted, setNonRunnerAccepted] = useState(false)

  const [intentions, setIntentions] = useState<string[]>([])   // intenções múltiplas do cliente
  const [intentInput, setIntentInput] = useState('')
  const [svcDesc, setSvcDesc] = useState('')
  const [unitId, setUnitId] = useState('')
  const [serviceTypes, setServiceTypes] = useState<any[]>([])      // catálogo de tipos da oficina
  const [chosenServices, setChosenServices] = useState<any[]>([])  // serviços escolhidos p/ este carro
  const [presence, setPresence] = useState<'waits' | 'leaves' | null>(null)  // decidido à entrada
  const [presenceTouched, setPresenceTouched] = useState(false)   // o Yury já mexeu à mão?

  const [km, setKm] = useState(''); const [fuel, setFuel] = useState(2)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [valuables, setValuables] = useState('')
  const [batteryRef, setBatteryRef] = useState('')                           // referência da bateria
  const [systemsCheck, setSystemsCheck] = useState<Record<string, string>>({})  // sistema → ok/fail/untested
  const [wantsOldParts, setWantsOldParts] = useState<boolean | null>(null)   // quer as peças antigas
  const [showDiagNotice, setShowDiagNotice] = useState(false)                // pop-up do dever de diagnóstico
  const [remapAccepted, setRemapAccepted] = useState(false)                  // cliente aceitou o aviso de remap/dyno
  const [signerIsOwner, setSignerIsOwner] = useState(true)                   // quem assina é o dono?
  const [signerName, setSignerName] = useState('')                          // nome de quem entregou (se não é o dono)
  const [biNumber, setBiNumber] = useState('')                              // nº do BI de quem assina
  const [biKnown, setBiKnown] = useState<null | { name: string }>(null)     // já temos este BI na base?
  const [biChecking, setBiChecking] = useState(false)

  const [damages, setDamages] = useState<Damage[]>([])
  const [dmgGroup, setDmgGroup] = useState(0)

  const [photos, setPhotos] = useState<Record<string, Blob>>({})          // por enviar (novas ou substituídas)
  const [serverPhotos, setServerPhotos] = useState<Record<string, { id: string; url: string }>>({})  // já no servidor
  const [idDoc, setIdDoc] = useState<Blob | null>(null)   // foto do documento de identificação

  const [handedOff, setHandedOff] = useState(false)       // colaborador entregou o tablet ao cliente
  const [reviewed, setReviewed] = useState(false)         // cliente reviu o resumo
  const [tc, setTc] = useState([false, false, false])
  const [sigData, setSigData] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)  // barra de envio
  const [compsize, setCompsize] = useState<{ before: number; after: number } | null>(null)  // diagnóstico de compressão
  const [result, setResult] = useState<{ number: string; offline: boolean; joId?: string; draft?: boolean } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const pendingZone = useRef<string>('')

  useEffect(() => {
    api('/api/v1/business-units').then(r => { setUnits(r.data); if (r.data[0]) setUnitId(r.data[0].id) }).catch(() => {})
    api('/api/v1/terms/active').then(setTerms).catch(() => {})
    api('/api/v1/service-types').then(r => setServiceTypes(r.data || [])).catch(() => {})
    api('/api/v1/terms/non_runner').then(setNonRunnerTerms).catch(() => {})
    // Pop-up do dever de diagnóstico (se ligado) — só numa entrada nova, não ao retomar rascunho
    if (!resumeDraftId) {
      if (!quick) api("/api/v1/reception-config").then(r => { if (r.diagnosisNoticeOn) setShowDiagNotice(true) }).catch(() => {})
    }
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true, timeout: 8000 })
  }, [])

  // Retomar rascunho: carrega e preenche os campos
  useEffect(() => {
    if (!resumeDraftId) return
    api(`/api/v1/receptions/${resumeDraftId}/draft`).then(({ data: d, photos: ps, servicos }) => {
      if (servicos?.length) setChosenServices(servicos.map((sv: any) => ({
        serviceTypeId: sv.service_type_id, typeName: sv.type_name, notes: sv.notes || undefined,
      })))
      // Fotos já enviadas neste rascunho — não se voltam a tirar nem a enviar.
      const jaLa: Record<string, { id: string; url: string }> = {}
      for (const p of (ps || [])) if (p.url) jaLa[p.zone] = { id: p.id, url: p.url }
      setServerPhotos(jaLa)
      setExistingCust({ id: d.customer_id, full_name: d.customer_name, phone: d.customer_phone })
      // Carregar as viaturas do cliente — senão o passo da viatura fica vazio
      // e a viatura do rascunho não aparece (parece um registo novo).
      if (d.customer_id) {
        api(`/api/v1/customers/${d.customer_id}/vehicles`).then(r => setCustVehicles(r.data || [])).catch(() => {})
      }
      setExistingVeh({ id: d.vehicle_id, plate: d.plate, brand: d.brand, model: d.model, year: d.year })
      setKm(d.km_entry != null ? String(d.km_entry) : '')
      setFuel(d.fuel_level ?? 2)
      setIsNonRunner(!!d.is_non_runner)
      if (d.client_presence) { setPresence(d.client_presence); setPresenceTouched(true) }
      if (d.entry_pending_reason) { setEntryPending(true); setPendingReason(d.entry_pending_reason) }
      setValuables(d.declared_valuables || '')
      setChecklist(typeof d.checklist === 'string' ? JSON.parse(d.checklist) : (d.checklist || {}))
      setBatteryRef(d.battery_reference || '')
      setSystemsCheck(typeof d.systems_check === 'string' ? JSON.parse(d.systems_check) : (d.systems_check || {}))
      if (d.wants_old_parts != null) setWantsOldParts(d.wants_old_parts)
      const dz = typeof d.damage_zones === 'string' ? JSON.parse(d.damage_zones) : (d.damage_zones || [])
      setDamages(dz.map((x: any) => ({ ...x, photo: null })))
      const ints = typeof d.intentions === 'string' ? JSON.parse(d.intentions) : (d.intentions || [])
      setIntentions(ints)
      setSvcDesc(d.service_description || '')
      if (d.booking_date) setBookingDate(String(d.booking_date).slice(0, 16))
    }).catch((e: any) => {
      // Não cair para uma entrada em branco em silêncio: se o rascunho não
      // carrega, o Yury tem de saber, senão parece uma entrada nova e ele
      // recomeça do zero (e cria um duplicado).
      setDraftLoadError(e?.message || 'Não foi possível carregar este rascunho. Verifica a ligação e tenta outra vez.')
    })
  }, [resumeDraftId])

  // Guardar rascunho (precisa de cliente + viatura)
  const canSaveDraft = (!!existingCust || (newCust && custName.trim().length >= 2 && V.phone(custPhone)))
    && (!!existingVeh || V.plate(plate))
  const saveDraft = async () => {
    setSavingDraft(true)
    const payload: any = {
      draftId: draftId || undefined,
      businessUnitId: unitId,
      customer: existingCust ? { id: existingCust.id } : { fullName: custName, phone: custPhone, email: custEmail || undefined },
      vehicle: existingVeh ? { id: existingVeh.id, plate: existingVeh.plate }
        : { plate: plate.toUpperCase(), brand, model, year: vyear ? Number(vyear) : undefined, vin: vin.trim() || undefined },
      kmEntry: km ? Number(km) : undefined, fuelLevel: fuel,
      declaredValuables: valuables || undefined,
      checklist, damageZones: damages.map(d => ({ id: d.id, area: d.area, note: d.note })),
      batteryReference: batteryRef || undefined, systemsCheck,
      wantsOldParts: wantsOldParts ?? undefined,
      isNonRunner,
      clientPresence: presence || undefined,
      entryType: quick ? 'quick' : 'full',
      entryPendingReason: entryPending ? pendingReason.trim() : undefined,
      intentions: intentions.length ? intentions : chosenServices.map(x => x.typeName),
      services: chosenServices.map(({ serviceTypeId, typeName, notes }) => ({ serviceTypeId, typeName, notes })), serviceDescription: svcDesc || undefined,
      bookingDate: bookingDate || undefined,
    }
    try {
      const r = await api('/api/v1/receptions/draft', { method: 'POST', body: JSON.stringify(payload) })
      setDraftId(r.id)

      // Enviar as fotos que ainda não subiram. Sem isto, as fotos vivem só na
      // memória do telemóvel e perdem-se ao sair do ecrã — o trabalho todo.
      // Só sobem as novas: as que já lá estão não se reenviam.
      const porEnviar = Object.entries(photos)
      const dmgPorEnviar = damages.filter(d => d.photo)
      const total = porEnviar.length + dmgPorEnviar.length
      if (total > 0) {
        let done = 0
        setProgress({ done: 0, total })
        const subidas: Record<string, { id: string; url: string }> = {}
        for (const [zone, blob] of porEnviar) {
          const img = await compressImage(blob)
          await uploadPhoto(r.id, zone, img, { isRequired: true })
          subidas[zone] = { id: '', url: URL.createObjectURL(img) }
          setProgress({ done: ++done, total })
        }
        for (const d of dmgPorEnviar) {
          const img = await compressImage(d.photo!)
          await uploadPhoto(r.id, `damage-${d.id}`, img)
          subidas[`damage-${d.id}`] = { id: '', url: URL.createObjectURL(img) }
          setProgress({ done: ++done, total })
        }
        // O que subiu deixa de estar "por enviar" — nem no finalizar, nem
        // no próximo guardar. Uma foto sobe uma vez.
        setServerPhotos(sp => ({ ...sp, ...subidas }))
        setPhotos({})
        setDamages(ds => ds.map(d => d.photo ? { ...d, photo: null } : d))
        setProgress(null)
      }
      setResult({ number: r.number, offline: false, draft: true } as any)
    } catch (e: any) {
      setProgress(null)
      alert(e?.message || 'Não foi possível guardar o rascunho.')
    }
    finally { setSavingDraft(false) }
  }


  useEffect(() => {
    if (existingCust || newCust) return
    const q = custSearch.trim()
    if (q.length < 2) { setCustResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try { const r = await api(`/api/v1/customers/search?q=${encodeURIComponent(q)}`); setCustResults(r.data) }
      catch { setCustResults([]) } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [custSearch, existingCust, newCust])

  const pickCustomer = async (c: any) => {
    setExistingCust(c); setCustResults([]); setCustSearch('')
    try { const r = await api(`/api/v1/customers/${c.id}/vehicles`); setCustVehicles(r.data) }
    catch { setCustVehicles([]) }
  }

  const takePhoto = (zone: string) => { pendingZone.current = zone; fileRef.current?.click() }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    const z = pendingZone.current
    if (z.startsWith('__dmg__')) {
      const id = z.replace('__dmg__', '')
      setDamages(ds => ds.map(d => d.id === id ? { ...d, photo: f } : d))
    }
    else if (z === '__iddoc__') setIdDoc(f)
    else setPhotos(p => ({ ...p, [z]: f }))   // zonas 360° e painel juntos
    e.target.value = ''
  }

  const toggleService = (t: any) => {
    const ehPPI = /ppi/i.test(t.name)
    setChosenServices(cur => {
      const ja = cur.find(x => x.serviceTypeId === t.id)
      if (ja) {
        // desmarcar
        const novo = cur.filter(x => x.serviceTypeId !== t.id)
        if (!presenceTouched) setPresence(novo.some(x => x.clientPresence === 'leaves') ? 'leaves' : novo.length ? 'waits' : null)
        return novo
      }
      // PPI é serviço único: escolher um PPI limpa o resto, e escolher outro
      // serviço quando há um PPI substitui-o. Não se combina inspeção de
      // compra com reparações — o que o PPI revelar vira uma OS depois.
      const jaTemPPI = cur.some(x => /ppi/i.test(x.typeName))
      let novo
      if (ehPPI) novo = [{ serviceTypeId: t.id, typeName: t.name, clientPresence: t.client_presence }]
      else if (jaTemPPI) novo = [{ serviceTypeId: t.id, typeName: t.name, clientPresence: t.client_presence }]
      else novo = [...cur, { serviceTypeId: t.id, typeName: t.name, clientPresence: t.client_presence }]
      if (!presenceTouched) setPresence(novo.some(x => x.clientPresence === 'leaves') ? 'leaves' : novo.length ? 'waits' : null)
      return novo
    })
  }

  const addIntention = (v: string) => {
    const t = v.trim()
    if (t && !intentions.includes(t)) setIntentions(xs => [...xs, t])
    setIntentInput('')
  }
  const removeIntention = (v: string) => setIntentions(xs => xs.filter(x => x !== v))

  const addDamage = (area: string) =>
    setDamages(ds => [...ds, { id: crypto.randomUUID().slice(0, 8), area, note: '', photo: null }])
  const removeDamage = (id: string) => setDamages(ds => ds.filter(d => d.id !== id))
  const setDmgNote = (id: string, note: string) =>
    setDamages(ds => ds.map(d => d.id === id ? { ...d, note } : d))

  // Uma zona conta como feita se tem foto nova por enviar OU já enviada.
  const hasShot = (k: string) => !!photos[k] || !!serverPhotos[k]
  const shotUrl = (k: string) => photos[k] ? URL.createObjectURL(photos[k]) : (serverPhotos[k]?.url || null)
  const reqCount = REQ_ZONES.filter(z => hasShot(z.key)).length
  const wheelCount = WHEEL_ZONES.filter(z => hasShot(z.key)).length
  const batteryCount = hasShot(BATTERY_ZONE.key) ? 1 : 0
  const dashCount = DASH_ZONES.filter(z => hasShot(z.key)).length
  const totalReq = reqCount + wheelCount + batteryCount + dashCount
  const allTc = tc.every(Boolean)
  // Detecta se o serviço envolve remap ou dyno (para o aviso específico)
  // Rede de segurança: detecção por palavras-chave é frágil (um termo que não
  // esteja aqui escapa ao aviso). Solução definitiva = tipo de serviço explícito
  // e configurável por oficina. Até lá, alargámos a lista.
  // Já não se adivinha por palavras: o tipo é escolhido. Um serviço cujo
  // nome sugira remap/dyno/unichip liga o aviso e os T&C próprios.
  const isRemapDyno = chosenServices.some(sv => /remap|reprogram|dyno|tune|stage|unichip|chip|ecu|centralina|pops|bangs|launch|adblue|dpf|egr/i.test(sv.typeName || ''))

  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!existingCust || (newCust && custName.trim().length >= 2 && V.phone(custPhone) && V.email(custEmail))
      case 1: return !!existingVeh || (V.plate(plate) && V.year(vyear))  // ano opcional (V.year aceita vazio)
      case 2: return chosenServices.length >= 1 && !!presence && (quick ? V.km(km) : intentions.length >= 1)
      case 3: return valuables.trim().length > 0 && (entryPending ? pendingReason.trim().length >= 3 : V.km(km)) && wantsOldParts !== null
      case 4: return true                       // danos são opcionais
      case 5: {
        // Com a entrada pendente, dispensam-se só as 3 do painel (exigem ignição).
        // Exterior, rodas e bateria continuam obrigatórios: são a defesa contra
        // "faltava-me uma peça", e essas tiram-se com o carro morto.
        const exigidas = entryPending ? REQ_TOTAL - DASH_ZONES.length : REQ_TOTAL
        const tiradas = entryPending ? reqCount + wheelCount + batteryCount : totalReq
        return tiradas >= exigidas && batteryRef.trim().length > 0
      }
      case 6: {
        if (!allTc || !sigData) return false
        if (isRemapDyno && !remapAccepted) return false
        if (isNonRunner && !nonRunnerAccepted) return false
        if (!signerIsOwner && signerName.trim().length < 2) return false
        // identidade: precisa se é portador, ou se é dono mas cliente novo
        const needsId = !signerIsOwner || (newCust && !existingCust)
        if (needsId) {
          if (biNumber.trim().length < 4) return false
          // ou já temos o BI na base, ou temos foto nova
          if (!biKnown && !idDoc) return false
        }
        return true
      }
      default: return true
    }
  }

  const submit = async () => {
    setBusy(true)
    const payload: any = {
      draftId: draftId || undefined,
      businessUnitId: unitId, source: 'walkin',
      customer: existingCust ? { id: existingCust.id }
        : { fullName: custName, phone: custPhone, email: custEmail || undefined },
      vehicle: existingVeh ? { id: existingVeh.id, plate: existingVeh.plate }
        : { plate: plate.toUpperCase(), brand, model, year: vyear ? Number(vyear) : undefined, vin: vin.trim() || undefined },
      kmEntry: km ? Number(km) : undefined, fuelLevel: fuel,
      declaredValuables: valuables || 'Nenhum objecto declarado',
      checklist,
      damageZones: damages.map(d => ({ id: d.id, area: d.area, note: d.note })),
      batteryReference: batteryRef || undefined, systemsCheck,
      wantsOldParts: wantsOldParts ?? undefined,
      isNonRunner,
      clientPresence: presence || undefined,
      entryType: quick ? 'quick' : 'full',
      entryPendingReason: entryPending ? pendingReason.trim() : undefined,
      intentions: intentions.length ? intentions : chosenServices.map(x => x.typeName),
      services: chosenServices.map(({ serviceTypeId, typeName, notes }) => ({ serviceTypeId, typeName, notes })), serviceDescription: svcDesc || undefined,
      bookingDate: bookingDate || undefined,
      termsVersion: terms?.version || '1.0',
      termsAcceptedAt: new Date().toISOString(),
    }
    const allReq = ALL_ZONES   // as 14 obrigatórias
    // Só sobem as que ainda não estão no servidor. Um rascunho retomado já
    // tem as suas lá — reenviá-las seria pagar duas vezes a mesma factura em 3G.
    const reqPhotos = allReq.filter(z => photos[z.key])
    const damagePhotos = damages.filter(d => d.photo)
    const totalUploads = reqPhotos.length + damagePhotos.length + (idDoc ? 1 : 0)
    let joCriada: any = null
    try {
      if (!navigator.onLine) throw new Error('OFFLINE')
      const jo = await api('/api/v1/receptions', { method: 'POST', body: JSON.stringify(payload) })
      joCriada = jo                       // a partir daqui já existe no servidor
      let done = 0
      let totalBefore = 0, totalAfter = 0
      setProgress({ done: 0, total: totalUploads })
      for (const z of reqPhotos) {
        const img = await compressImage(photos[z.key])
        totalBefore += photos[z.key].size; totalAfter += img.size
        setCompsize({ before: totalBefore, after: totalAfter })
        await uploadPhoto(jo.id, z.key, img, { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
        setProgress({ done: ++done, total: totalUploads })
      }
      for (const d of damagePhotos) {
        const img = await compressImage(d.photo!)
        await uploadPhoto(jo.id, `damage-${d.id}`, img, { latitude: gps?.lat, longitude: gps?.lng })
        setProgress({ done: ++done, total: totalUploads })
      }
      if (idDoc) {
        const img = await compressImage(idDoc)
        const b64 = await blobToBase64(img)
        await api(`/api/v1/receptions/${jo.id}/id-document`, {
          method: 'POST', body: JSON.stringify({
            imageBase64: b64,
            biNumber: biNumber.trim() || undefined,
            fullName: (signerIsOwner ? custName : signerName).trim() || undefined,
          }),
        })
        setProgress({ done: ++done, total: totalUploads })
      }
      if (sigData) await api(`/api/v1/receptions/${jo.id}/sign`, {
        method: 'POST', body: JSON.stringify({
          signatureBase64: sigData.split(',')[1],
          signerIsOwner, signerName: signerIsOwner ? undefined : (signerName || undefined),
          signerBiNumber: biNumber || undefined,
        }),
      })
      setProgress(null)
      setResult({ number: jo.number, offline: false, joId: jo.id })
    } catch (e: any) {
      // A fila offline só serve para o que NUNCA chegou ao servidor. Se a JO
      // já foi criada, enfileirá-la outra vez criaria uma segunda entrada do
      // mesmo carro — e dizer "guardada offline" seria mentira: metade está lá.
      if (joCriada) {
        setProgress(null)
        setErroFinal({
          joId: joCriada.id, numero: joCriada.number,
          msg: e?.message || 'A ligação falhou a meio do envio.',
        })
        return
      }
      const offlineId = await offline.enqueueReception(payload)
      for (const z of allReq)
        if (photos[z.key]) await offline.savePhotoBlob(offlineId, z.key, photos[z.key], { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      for (const d of damages)
        if (d.photo) await offline.savePhotoBlob(offlineId, `damage-${d.id}`, d.photo, {})
      if (idDoc) await offline.savePhotoBlob(offlineId, 'id-document', idDoc, {})
      setProgress(null)
      setResult({ number: 'Pendente (offline)', offline: true })
    } finally { setBusy(false) }
  }

  if (draftLoadError) return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Rascunho</h2><span />
      </div>
      <div className="pending-box">
        <div className="pending-head" style={{ color: 'var(--danger)' }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Não foi possível abrir o rascunho</div>
        <p>{draftLoadError}</p>
        <p><strong>Não recomeces a entrada por aqui</strong> — o rascunho não se perdeu, está guardado. Volta à lista e tenta abri-lo outra vez daqui a um momento.</p>
      </div>
      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={onBack}>
        Voltar à lista
      </button>
    </main>
  )

  if (erroFinal) return (
    <main className="reception">
      <div className="success-box">
        <div className="success-ic" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
        </div>
        <div className="success-number">{erroFinal.numero}</div>
        <p><strong>A entrada foi criada, mas o envio falhou a meio.</strong></p>
        <p style={{ marginTop: 8 }}>{erroFinal.msg}</p>
        <p style={{ marginTop: 8 }}>
          Parte das fotos já está no servidor. Abre esta entrada na lista de recepções
          e usa <strong>“Completar entrada”</strong> para acrescentar o que faltou.
          Não voltes a lançar o carro — ficarias com duas entradas do mesmo.
        </p>
        <div className="success-actions">
          <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={onDone}>Ver recepções</button>
        </div>
      </div>
    </main>
  )

  if (result) return (
    <main className="reception">
      <div className="success-box">
        <div className="success-ic"><i className={`ti ${result.draft ? 'ti-device-floppy' : 'ti-check'}`} aria-hidden="true"></i></div>
        <div className="success-number">{result.number}</div>
        <p>{result.draft
          ? 'Rascunho guardado. Podes continuar este lançamento mais tarde a partir da lista de recepções.'
          : result.offline
          ? 'Recepção guardada no tablet. Sincroniza automaticamente quando houver internet.'
          : 'Ordem de trabalho criada, fotos carregadas e documento assinado arquivado.'}</p>
        <div className="success-actions">
          {!result.offline && !result.draft && result.joId && (
            <button className="btn-primary" style={{ justifyContent: 'center' }}
              onClick={async () => {
                try { const r = await api(`/api/v1/receptions/${result.joId}/pdf`); if (r.url) window.open(r.url, '_blank') }
                catch { alert('Não foi possível abrir o PDF agora.') }
              }}>
              <i className="ti ti-printer" aria-hidden="true"></i> Imprimir documento
            </button>
          )}
          <button className={(result.offline || result.draft) ? 'btn-primary' : 'btn-ghost'} onClick={onDone} style={{ justifyContent: 'center' }}>Ver recepções</button>
        </div>
      </div>
    </main>
  )

  const steps = ['Cliente', 'Viatura', 'Intenção', 'Estado', 'Danos', 'Fotos', 'Assinatura']

  return (
    <main className="reception">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />

      {showDiagNotice && (
        <div className="notice-overlay">
          <div className="notice-card">
            <div className="notice-ic"><i className="ti ti-stethoscope" aria-hidden="true"></i></div>
            <h2>Antes de começar</h2>
            <p>A nossa responsabilidade não termina na queixa do cliente. Verifica o básico e observa o carro com atenção — se notares falhas, ruídos ou comportamentos estranhos, regista-os. O cliente decide se quer ver, mas é nosso dever reportar.</p>
            <p><strong>O diagnóstico electrónico é obrigatório em todos os casos</strong>, com evidências fotográficas. É da tua responsabilidade.</p>
            <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={() => setShowDiagNotice(false)}>Entendido, vou verificar</button>
          </div>
        </div>
      )}

      <div className="rec-top">
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Sair</button>
        <span className="rec-stepname">{step + 1} de {steps.length} · {steps[step]}</span>
        {canSaveDraft
          ? <button className="btn-ghost btn-sm" disabled={savingDraft} onClick={saveDraft} title="Guardar rascunho">
              <i className={`ti ${savingDraft ? 'ti-loader' : 'ti-device-floppy'}`} aria-hidden="true"></i> Rascunho
            </button>
          : (gps ? <span className="gps-ok"><i className="ti ti-map-pin" aria-hidden="true"></i> GPS</span> : <span />)}
      </div>
      <div className="rec-progress">
        {steps.map((_, i) => <div key={i} className={`rp-seg ${i < step ? 'done' : i === step ? 'cur' : ''}`} />)}
      </div>

      {/* 1 — CLIENTE */}
      {step === 0 && (
        <section>
          <h2>Cliente</h2>
          <p className="lead">Procura um cliente que já cá veio, ou regista um novo.</p>
          {!existingCust && !newCust && (
            <>
              <label className="fl">Pesquisar por nome ou telemóvel</label>
              <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Escreve o nome ou número…" />
              {searching && <div className="hint">A procurar…</div>}
              {custResults.length > 0 && (
                <div className="cust-results">
                  {custResults.map(c => (
                    <button key={c.id} className="cust-row" onClick={() => pickCustomer(c)}>
                      <div className="cust-av">{c.full_name[0]}</div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div className="cust-name">{c.full_name}</div>
                        <div className="cust-sub">{c.phone} · {c.visits} visita{c.visits === '1' ? '' : 's'}</div>
                      </div>
                      <span className="badge-recur">Recorrente</span>
                    </button>
                  ))}
                </div>
              )}
              {custSearch.trim().length >= 2 && !searching && custResults.length === 0 &&
                <div className="hint">Nenhum cliente encontrado.</div>}
              <button className="btn-outline" style={{ marginTop: 14, width: '100%' }} onClick={() => setNewCust(true)}>
                <i className="ti ti-plus" aria-hidden="true"></i> Novo cliente
              </button>
            </>
          )}
          {existingCust && (
            <div className="picked">
              <div className="picked-head">
                <span className="badge-recur">Cliente recorrente</span>
                <button className="btn-ghost btn-sm" onClick={() => { setExistingCust(null); setCustVehicles([]); setExistingVeh(null) }}>Trocar</button>
              </div>
              <div className="picked-name">{existingCust.full_name}</div>
              <div className="picked-sub">{existingCust.phone}</div>
            </div>
          )}
          {newCust && (
            <>
              <div className="picked-head" style={{ marginBottom: 12 }}>
                <span className="badge-new">Novo cliente</span>
                <button className="btn-ghost btn-sm" onClick={() => setNewCust(false)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
              </div>
              <div className="grid2">
                <div><label className="fl">Nome completo <span className="req">*</span></label>
                  <input autoFocus value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nome do cliente" /></div>
                <div><label className="fl">Telemóvel <span className="req">*</span></label>
                  <input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="+258 84 000 0000" />
                  {custPhone.length >= 6 && !V.phone(custPhone) && <div className="field-warn">Número de telefone inválido.</div>}</div>
              </div>
              <div style={{ marginTop: 14 }}><label className="fl">Email (opcional)</label>
                <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} placeholder="email@exemplo.com" />
                {!V.email(custEmail) && <div className="field-warn">Email com formato inválido.</div>}</div>
            </>
          )}
          <div className="rec-nav"><span />
            <button className="btn-primary" disabled={!canNext()} onClick={goNext}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 2 — VIATURA */}
      {step === 1 && (
        <section>
          <h2>Viatura</h2>
          <p className="lead">{existingCust && custVehicles.length > 0 ? 'Escolhe um carro do cliente ou regista outro.' : 'Regista os dados da viatura.'}</p>
          {existingCust && custVehicles.length > 0 && !newVeh && (
            <>
              <div className="veh-list">
                {custVehicles.map(v => (
                  <button key={v.id} className={`veh-row ${existingVeh?.id === v.id ? 'on' : ''}`} onClick={() => setExistingVeh(v)}>
                    <span className="veh-plate">{v.plate}</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="veh-name">{v.brand} {v.model} {v.year ? `· ${v.year}` : ''}</div>
                      <div className="veh-sub">{v.last_visit ? 'Já cá esteve' : 'Sem histórico'}</div>
                    </div>
                    {existingVeh?.id === v.id && <span className="veh-check"><i className="ti ti-check" aria-hidden="true"></i></span>}
                  </button>
                ))}
              </div>
              <button className="btn-outline" style={{ marginTop: 12, width: '100%' }} onClick={() => { setNewVeh(true); setExistingVeh(null) }}>
                <i className="ti ti-plus" aria-hidden="true"></i> Outro carro
              </button>
            </>
          )}
          {(newVeh || !existingCust || (existingCust && custVehicles.length === 0)) && (
            <>
              {existingCust && custVehicles.length > 0 &&
                <button className="btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => setNewVeh(false)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Ver carros do cliente</button>}
              <div className="grid3">
                <div><label className="fl">Matrícula <span className="req">*</span></label>
                  <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Matrícula da viatura" style={{ textTransform: 'uppercase', fontWeight: 500 }} /></div>
                <div><label className="fl">Marca</label><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="ex: Subaru" /></div>
                <div><label className="fl">Modelo</label><input value={model} onChange={e => setModel(e.target.value)} placeholder="ex: Impreza" /></div>
              </div>
              <div style={{ marginTop: 14, maxWidth: 160 }}><label className="fl">Ano (opcional)</label>
                <input type="number" value={vyear} onChange={e => setVyear(e.target.value)} placeholder="2020" />
                {!V.year(vyear) && <div className="field-warn">Ano inválido.</div>}</div>
              <div style={{ marginTop: 14 }}><label className="fl">VIN / Nº de chassi (opcional)</label>
                <input value={vin} onChange={e => setVin(e.target.value.toUpperCase())} placeholder="Ex: WVWZZZ1KZ8W123456" maxLength={20} />
                <p className="hint" style={{ marginTop: 6 }}>Identifica o carro de forma permanente — não muda quando a matrícula muda. Se souberes, regista; fica guardado para sempre.</p></div>
            </>
          )}

          <label className="chk-inline" style={{ marginTop: 18 }}>
            <input type="checkbox" checked={isNonRunner} onChange={e => setIsNonRunner(e.target.checked)} />
            O carro entrou <strong>sem funcionar</strong> (não arranca / não anda pelos próprios meios)
          </label>
          {isNonRunner && (
            <div className="nonrunner-box">
              <div className="nonrunner-head"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Condições especiais</div>
              <p>Um carro que não funciona não pode ser testado — travagem, arrefecimento, transmissão, electrónica e outros sistemas ficam por verificar. Aplicam-se termos próprios, que o cliente terá de aceitar antes de assinar.</p>
            </div>
          )}

          <div className="rec-nav">
            <button className="btn-ghost" onClick={goBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={goNext}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 3 — INTENÇÃO DO CLIENTE (fluida, múltipla) */}
      {step === 2 && (
        <section>
          <h2>O que traz o cliente</h2>
          <p className="lead">Escolhe o tipo (ou tipos) de serviço, e escreve o que o cliente pediu por palavras dele.</p>

          {serviceTypes.length > 0 && (
            <>
              <label className="fl">Tipo de serviço <span className="req">*</span></label>
              <p className="hint" style={{ marginBottom: 8 }}>Um carro pode trazer mais que um. Toca para escolher.{chosenServices.some(x => /ppi/i.test(x.typeName)) && ' O PPI é uma inspeção à parte — não se combina com outros serviços.'}</p>
              <div className="svc-type-grid">
                {serviceTypes.map(t => {
                  const on = chosenServices.some(x => x.serviceTypeId === t.id)
                  return (
                    <button key={t.id} className={`svc-type ${on ? 'on' : ''}`} onClick={() => toggleService(t)}>
                      <span className="svc-type-check">{on && <i className="ti ti-check" aria-hidden="true"></i>}</span>
                      <span className="svc-type-name">{t.name}</span>
                      <span className="svc-type-pres">{t.client_presence === 'waits' ? 'cliente espera' : 'deixa o carro'}</span>
                    </button>
                  )
                })}
              </div>

              {chosenServices.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <label className="fl">O cliente vai…</label>
                  <div className="seg-row">
                    <button className={`seg ${presence === 'waits' ? 'on' : ''}`}
                      onClick={() => { setPresence('waits'); setPresenceTouched(true) }}>
                      <i className="ti ti-clock" aria-hidden="true"></i> Esperar pelo carro
                    </button>
                    <button className={`seg ${presence === 'leaves' ? 'on' : ''}`}
                      onClick={() => { setPresence('leaves'); setPresenceTouched(true) }}>
                      <i className="ti ti-home-move" aria-hidden="true"></i> Deixar o carro
                    </button>
                  </div>
                  <p className="hint" style={{ marginTop: 6 }}>Já vem escolhido pelo tipo de serviço — muda se este cliente for exceção.</p>
                </div>
              )}
            </>
          )}

          {quick && (
            <>
              <label className="fl" style={{ marginTop: 18 }}>Quilómetros à entrada <span className="req">*</span></label>
              <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} placeholder="ex: 87340" />
              {km.length > 0 && !V.km(km) && <div className="field-warn">Km inválidos.</div>}
            </>
          )}

          <label className="fl" style={{ marginTop: 18 }}>O que o cliente relatou <span className="req">*</span></label>
          <div className="intent-input-row">
            <input value={intentInput}
              onChange={e => setIntentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIntention(intentInput) } }}
              placeholder="ex: barulho na frente, quer Stage 2, revisão…" list="svc-suggest" />
            <datalist id="svc-suggest">
              {serviceTypes.map(t => <option key={t.id} value={t.name} />)}
            </datalist>
            <button className="btn-primary" disabled={!intentInput.trim()} onClick={() => addIntention(intentInput)} style={{ padding: '12px 16px' }}>
              <i className="ti ti-plus" aria-hidden="true"></i>
            </button>
          </div>



          {intentions.length > 0 && (
            <div className="intent-list">
              {intentions.map(it => (
                <span key={it} className="intent-chip">
                  {it}
                  <button className="intent-x" onClick={() => removeIntention(it)} aria-label="Remover"><i className="ti ti-x" aria-hidden="true"></i></button>
                </span>
              ))}
            </div>
          )}

          <label className="fl" style={{ marginTop: 18 }}>Notas adicionais (opcional)</label>
          <textarea value={svcDesc} onChange={e => setSvcDesc(e.target.value)} rows={2} placeholder="Qualquer detalhe extra que ajude o diagnóstico…" />
          <label className="fl" style={{ marginTop: 18 }}>Data de marcação do cliente (opcional)</label>
          <input type="datetime-local" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
          <p className="hint" style={{ marginTop: 6 }}>Quando o cliente marcou ou vai trazer o carro. Serve para lembretes futuros.</p>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={goBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={goNext}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 4 — ESTADO */}
      {step === 3 && (
        <section>
          <h2>Estado à entrada</h2>
          <p className="lead">Quilometragem, combustível e o que vem com o carro.</p>
          <div className="grid2">
            <div><label className="fl">Km actuais {!entryPending && <span className="req">*</span>}</label>
              <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)}
                placeholder="ex: 87340" disabled={entryPending} /></div>
            <div><label className="fl">Combustível — {Math.round(fuel / 8 * 100)}%</label>
              <div className="fuel-segs">
                {Array.from({ length: 8 }).map((_, i) => <button key={i} className={`fs ${i < fuel ? 'on' : ''}`} onClick={() => setFuel(i + 1)} />)}
              </div></div>
          </div>

          <label className="chk-inline" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={entryPending} onChange={e => { setEntryPending(e.target.checked); if (e.target.checked) setKm('') }} />
            Não consigo ligar o carro para ver o km
          </label>
          {entryPending && (
            <div className="pending-box">
              <div className="pending-head"><i className="ti ti-battery-off" aria-hidden="true"></i> Entrada fica incompleta</div>
              <p>O km e as três fotos do painel ficam por registar. Podes fechar a entrada e assinar com o cliente agora — o resto completa-se quando o carro ligar.</p>
              <p><strong>A OS não arranca enquanto isto não estiver completo.</strong> O carro fica na oficina, portanto não custa nada acabar depois.</p>
              <label className="fl" style={{ marginTop: 10 }}>Porquê? <span className="req">*</span></label>
              <input value={pendingReason} onChange={e => setPendingReason(e.target.value)}
                placeholder="ex: bateria descarregada, carro não liga" />
              {pendingReason.trim().length > 0 && pendingReason.trim().length < 3 && <div className="field-warn">Escreve o motivo.</div>}
            </div>
          )}
          <label className="fl" style={{ marginTop: 18 }}>Itens entregues</label>
          <div className="chk-grid">
            {CHECKLIST.map(c => (
              <button key={c} className={`chk ${checklist[c] ? 'on' : ''}`} onClick={() => setChecklist(p => ({ ...p, [c]: !p[c] }))}>
                <span className="chk-box">{checklist[c] && <i className="ti ti-check" aria-hidden="true"></i>}</span>{c}
              </button>
            ))}
          </div>
          <label className="fl" style={{ marginTop: 18 }}>Objectos declarados pelo cliente <span className="req">*</span></label>
          <textarea value={valuables} onChange={e => setValuables(e.target.value)} placeholder="Objectos deixados na viatura…" rows={2} />
          <button className="btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setValuables('Nenhum objecto de valor declarado pelo cliente.')}>Nenhum objecto</button>

          <label className="fl" style={{ marginTop: 22 }}>Verificação de sistemas à entrada</label>
          <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Regista como o carro chegou — protege-te de reclamações sobre coisas que já vinham avariadas.</p>
          <div className="sys-list">
            {SYSTEM_CHECKS.map(s => (
              <div key={s} className="sys-row">
                <span className="sys-name">{s}</span>
                <div className="sys-opts">
                  {[['ok', 'OK', 'ti-check'], ['fail', 'Falha', 'ti-x'], ['untested', 'N/T', 'ti-minus']].map(([val, lbl, ic]) => (
                    <button key={val} className={`sys-opt ${systemsCheck[s] === val ? `on ${val}` : ''}`}
                      onClick={() => setSystemsCheck(p => ({ ...p, [s]: val }))} title={lbl}>
                      <i className={`ti ${ic}`} aria-hidden="true"></i>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <label className="fl" style={{ marginTop: 22 }}>Peças antigas <span className="req">*</span></label>
          <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>O cliente quer ficar com as peças que forem substituídas? (obrigatório — tem efeito legal)</p>
          <div className="seg">
            <button className={wantsOldParts === true ? 'on' : ''} onClick={() => setWantsOldParts(true)}>Sim, quer as peças</button>
            <button className={wantsOldParts === false ? 'on' : ''} onClick={() => setWantsOldParts(false)}>Não quer</button>
          </div>

          <div className="rec-nav">
            <button className="btn-ghost" onClick={goBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={goNext}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 5 — DANOS */}
      {step === 4 && (
        <section>
          <h2>Danos encontrados</h2>
          <p className="lead">Marca riscos, amolgadelas ou danos em qualquer zona. Cada um leva foto e nota. Opcional, mas protege-te de disputas.</p>
          <div className="dmg-tabs">
            {DMG_GROUPS.map((g, i) => (
              <button key={g.group} className={`dmg-tab ${dmgGroup === i ? 'on' : ''}`} onClick={() => setDmgGroup(i)}>
                <i className={`ti ${g.icon}`} style={{ fontSize: 14 }} aria-hidden="true"></i>{g.group}
              </button>
            ))}
          </div>
          <div className="carmap">
            <div className="carmap-label">Toca na zona do dano — {DMG_GROUPS[dmgGroup].group}</div>
            <div className="zone-btns">
              {DMG_GROUPS[dmgGroup].zones.map(z => (
                <button key={z} className="zone-btn" onClick={() => addDamage(z)}>
                  <i className="ti ti-plus" aria-hidden="true"></i>{z}
                </button>
              ))}
            </div>
          </div>
          {damages.length > 0 && (
            <div className="dmg-list">
              {damages.map((d, i) => (
                <div key={d.id} className="dmg-card">
                  <div className="dmg-num">{i + 1}</div>
                  <div className="dmg-body">
                    <div className="dmg-zone">{d.area}</div>
                    <textarea className="dmg-note" rows={1} value={d.note} onChange={e => setDmgNote(d.id, e.target.value)}
                      placeholder="Descreve o dano — ex: risco de 10cm, amolgadela funda…" />
                  </div>
                  <button className={`dmg-photo ${d.photo || serverPhotos[`damage-${d.id}`] ? 'filled' : ''}`} onClick={() => takePhoto(`__dmg__${d.id}`)}>
                    {d.photo ? <img src={URL.createObjectURL(d.photo)} alt="" />
                      : serverPhotos[`damage-${d.id}`] ? <img src={serverPhotos[`damage-${d.id}`].url} alt="" />
                      : <><i className="ti ti-camera" style={{ fontSize: 16 }} aria-hidden="true"></i>Foto</>}
                  </button>
                  <span className="dmg-x" onClick={() => removeDamage(d.id)}><i className="ti ti-x" aria-hidden="true"></i></span>
                </div>
              ))}
            </div>
          )}
          <div className="rec-nav">
            <button className="btn-ghost" onClick={goBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="dmg-count">{damages.length === 0 ? 'Sem danos' : `${damages.length} dano${damages.length === 1 ? '' : 's'}`}</span>
              <button className="btn-primary" onClick={goNext}>{damages.length === 0 ? 'Sem danos, continuar' : 'Continuar'} <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
            </div>
          </div>
        </section>
      )}

      {/* 6 — FOTOS (6 zonas 360° + 3 do painel, todas obrigatórias) */}
      {step === 5 && (
        <section>
          <h2>Fotos obrigatórias <span className="req">— {REQ_TOTAL} no total</span></h2>
          <p className="lead">Cada foto guarda data, hora e GPS — prova do estado à entrada. Não é possível avançar sem todas.</p>

          <label className="fl">Volta ao carro — 360°</label>
          <div className="photo-grid">
            {REQ_ZONES.map(z => (
              <button key={z.key} className={`photo-slot ${hasShot(z.key) ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {hasShot(z.key) ? <img src={shotUrl(z.key)!} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span>{z.label}</span>
              </button>
            ))}
          </div>

          <label className="fl" style={{ marginTop: 18 }}>Rodas — porcas em detalhe</label>
          <div className="photo-grid">
            {WHEEL_ZONES.map(z => (
              <button key={z.key} className={`photo-slot ${hasShot(z.key) ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {hasShot(z.key) ? <img src={shotUrl(z.key)!} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span>{z.label}</span>
              </button>
            ))}
          </div>

          <label className="fl" style={{ marginTop: 18 }}>Bateria</label>
          <div className="grid2" style={{ alignItems: 'start' }}>
            <button className={`photo-slot ${hasShot(BATTERY_ZONE.key) ? 'done' : ''}`} onClick={() => takePhoto(BATTERY_ZONE.key)}>
              {hasShot(BATTERY_ZONE.key) ? <img src={shotUrl(BATTERY_ZONE.key)!} alt="bateria" /> : <span className="photo-icon"><i className="ti ti-battery" aria-hidden="true"></i></span>}
              <span>{BATTERY_ZONE.label}</span>
            </button>
            <div>
              <label className="fl">Referência / marca <span className="req">*</span></label>
              <input value={batteryRef} onChange={e => setBatteryRef(e.target.value)} placeholder="ex: Bosch S4 60Ah" />
              <p className="hint" style={{ marginTop: 6 }}>Protege contra troca de bateria.</p>
            </div>
          </div>

          <label className="fl" style={{ marginTop: 18 }}>Painel e conta-km {entryPending && <span className="pending-tag">fica para depois</span>}</label>
          {entryPending && (
            <p className="hint" style={{ marginBottom: 8 }}>
              Marcaste que o carro não liga ({pendingReason || 'sem motivo'}). Estas três não são exigidas agora — mas a OS não arranca sem elas.
            </p>
          )}
          <div className={`dash-grid ${entryPending ? 'deferred' : ''}`}>
            {DASH_ZONES.map(z => (
              <button key={z.key} className={`photo-slot dash ${hasShot(z.key) ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {hasShot(z.key) ? <img src={shotUrl(z.key)!} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span className="dash-label">{z.label}</span>
                {!hasShot(z.key) && <span className="dash-hint">{z.hint}</span>}
              </button>
            ))}
          </div>

          <div className={`count-bar ${totalReq >= REQ_TOTAL ? 'ok' : 'bad'}`}>
            <i className={`ti ${totalReq >= REQ_TOTAL ? 'ti-circle-check' : 'ti-alert-triangle'}`} aria-hidden="true"></i>
            {totalReq} de {REQ_TOTAL} fotos {totalReq >= REQ_TOTAL ? '— completo' : `— faltam ${REQ_TOTAL - totalReq}`}
          </div>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={goBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={goNext}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 7 — ENTREGA AO CLIENTE + TERMOS + ASSINATURA */}
      {step === 6 && !handedOff && (
        <section className="handoff">
          <div className="handoff-ic"><i className="ti ti-device-tablet" aria-hidden="true"></i></div>
          <h2>Entregue o tablet ao cliente</h2>
          <p className="handoff-text">
            A seguir, o cliente vai <strong>rever o que foi registado</strong> e depois ler e assinar
            os <strong>Termos e Condições</strong> da {tenant?.name || 'oficina'}.
          </p>
          <p className="handoff-sub">Quando o cliente estiver com o tablet, toque em continuar.</p>
          <button className="btn-primary handoff-btn" onClick={() => setHandedOff(true)}>
            Continuar <i className="ti ti-arrow-right" aria-hidden="true"></i>
          </button>
          <button className="btn-ghost" style={{ marginTop: 10 }} onClick={goBack}>
            <i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar
          </button>
        </section>
      )}

      {/* Resumo para o CLIENTE rever com os próprios olhos */}
      {step === 6 && handedOff && !reviewed && (
        <section>
          <h2>Confirme os seus dados</h2>
          <p className="lead">Verifique se está tudo correcto antes de assinar. Se algo estiver errado, avise o nosso colaborador.</p>

          <div className="review-card">
            <div className="review-row"><span>Cliente</span><strong>{existingCust ? existingCust.full_name : custName}</strong></div>
            <div className="review-row"><span>Viatura</span><strong>{existingVeh ? `${existingVeh.brand || ''} ${existingVeh.model || ''}`.trim() : `${brand} ${model}`.trim() || '—'}</strong></div>
            <div className="review-row"><span>Matrícula</span><strong>{(existingVeh ? existingVeh.plate : plate).toUpperCase()}</strong></div>
            <div className="review-row"><span>Quilometragem</span><strong>{km ? `${MZmt(Number(km))} km` : '—'}</strong></div>
            <div className="review-row"><span>Combustível</span><strong>{Math.round(fuel / 8 * 100)}%</strong></div>
            <div className="review-row"><span>Objectos declarados</span><strong>{valuables}</strong></div>
            {batteryRef && <div className="review-row"><span>Bateria</span><strong>{batteryRef}</strong></div>}
            {wantsOldParts != null && <div className="review-row"><span>Peças antigas</span><strong>{wantsOldParts ? 'Quero ficar com elas' : 'Não quero'}</strong></div>}
          </div>

          <div className="review-block">
            <div className="review-block-title">O que pediu</div>
            <div className="review-chips">
              {intentions.map(it => <span key={it} className="review-chip">{it}</span>)}
            </div>
          </div>

          {Object.keys(systemsCheck).length > 0 && (
            <div className="review-block">
              <div className="review-block-title">Verificação de sistemas à entrada</div>
              <div className="review-sys">
                {Object.entries(systemsCheck).map(([k, v]) => (
                  <span key={k} className={`review-sys-item ${v}`}>{k}: {v === 'ok' ? 'OK' : v === 'fail' ? 'Falha' : 'N/T'}</span>
                ))}
              </div>
            </div>
          )}

          {damages.length > 0 && (
            <div className="review-block">
              <div className="review-block-title">Danos registados à entrada</div>
              {damages.map((d, i) => (
                <div key={d.id} className="review-damage">
                  <span className="review-damage-n">{i + 1}</span>
                  <span>{d.area}{d.note ? ` — ${d.note}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="review-block">
            <div className="review-block-title">Fotos tiradas ({[...REQ_ZONES, ...WHEEL_ZONES, BATTERY_ZONE, ...DASH_ZONES].filter(z => photos[z.key]).length})</div>
            <div className="review-photos">
              {[...REQ_ZONES, ...WHEEL_ZONES, BATTERY_ZONE, ...DASH_ZONES].map(z => photos[z.key] && (
                <div key={z.key} className="review-photo">
                  <img src={URL.createObjectURL(photos[z.key])} alt={z.label} />
                </div>
              ))}
            </div>
          </div>

          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setHandedOff(false)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
            <button className="btn-primary" onClick={() => setReviewed(true)}>Está tudo correcto <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {step === 6 && handedOff && reviewed && (
        <section>
          <h2>Termos e Condições</h2>
          <p className="lead">Leia, aceite e assine para concluir a entrada da viatura.</p>
          <div className="tc-scroll">{terms?.content || 'A carregar termos…'}</div>
          {[
            'Li e aceito os Termos e Condições, incluindo o registo fotográfico como prova do estado da viatura.',
            `Aceito a política de parqueamento — ${MZmt(terms?.parking_fee ?? 1000)} MZN/dia após ${terms?.parking_grace_days ?? 7} dias do aviso de conclusão.`,
            'Autorizo o diagnóstico e o tratamento dos meus dados, incluindo o documento de identificação, para gestão do serviço.',
          ].map((label, i) => (
            <button key={i} className={`chk tc ${tc[i] ? 'on' : ''}`} onClick={() => setTc(t => t.map((v, j) => j === i ? !v : v))}>
              <span className="chk-box">{tc[i] && <i className="ti ti-check" aria-hidden="true"></i>}</span>{label}
            </button>
          ))}

          {isRemapDyno && (
            <div className="remap-warning">
              <div className="remap-warning-head"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Aviso importante — Reprogramação / Dyno</div>
              <p>A oficina responde pela correcta execução do serviço de reprogramação. Não é prestada garantia sobre componentes mecânicos do veículo (motor, caixa, embraiagem, turbo, entre outros), que não são objecto deste serviço e cujo estado interno e desgaste preexistente não são determináveis por diagnóstico.</p>
              <p>A reprogramação aumenta a solicitação mecânica e pode expor fragilidades já existentes. Esta é a prática corrente no sector de tuning a nível internacional.</p>
              <button className={`chk tc ${remapAccepted ? 'on' : ''}`} onClick={() => setRemapAccepted(v => !v)}>
                <span className="chk-box">{remapAccepted && <i className="ti ti-check" aria-hidden="true"></i>}</span>
                Li e aceito este aviso, e autorizo o serviço de reprogramação nestas condições.
              </button>
            </div>
          )}

          {isNonRunner && (
            <div className="remap-warning nonrunner">
              <div className="remap-warning-head"><i className="ti ti-engine-off" aria-hidden="true"></i> Aviso importante — Veículo entrou sem funcionar</div>
              {nonRunnerTerms?.content
                ? <pre className="terms-text">{nonRunnerTerms.content}</pre>
                : <p>Um veículo que não funciona não pode ser testado. O registo de entrada reflecte apenas o que foi possível observar, e não substitui uma avaliação do estado geral do veículo. Podem existir avarias que só se revelem quando o veículo voltar a funcionar.</p>}
              <button className={`chk tc ${nonRunnerAccepted ? 'on' : ''}`} onClick={() => setNonRunnerAccepted(v => !v)}>
                <span className="chk-box">{nonRunnerAccepted && <i className="ti ti-check" aria-hidden="true"></i>}</span>
                Li e aceito os termos aplicáveis a veículo que entra sem funcionar.
              </button>
            </div>
          )}

          <label className="chk-inline" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={!signerIsOwner} onChange={e => { setSignerIsOwner(!e.target.checked); setBiNumber(''); setBiKnown(null); setIdDoc(null) }} />
            Quem assina não é o dono (trouxe o carro em nome dele)
          </label>
          {!signerIsOwner && (
            <>
              <label className="fl" style={{ marginTop: 10 }}>Nome de quem entrega o carro <span className="req">*</span></label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Nome e apelido de quem trouxe o veículo" />
              <p className="hint" style={{ marginTop: 6 }}>Esta pessoa verifica o registo consigo e assina, confirmando o estado de entrada em nome do dono.</p>
            </>
          )}

          {/* Documento de identificação de quem assina — só se for preciso */}
          {(!signerIsOwner || (newCust && !existingCust)) && (
            <>
              <label className="fl" style={{ marginTop: 14 }}>Nº do documento de {signerIsOwner ? 'identificação' : 'quem entrega'} <span className="req">*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={biNumber} style={{ flex: 1 }}
                  onChange={e => { setBiNumber(e.target.value); setBiKnown(null) }}
                  onBlur={async () => {
                    const n = biNumber.trim()
                    if (n.length < 4) return
                    setBiChecking(true)
                    try {
                      const r = await api(`/api/v1/identity/${encodeURIComponent(n)}`)
                      if (r.found && r.hasPhoto) { setBiKnown({ name: r.fullName }); setIdDoc(null) }
                      else setBiKnown(null)
                    } catch { setBiKnown(null) }
                    finally { setBiChecking(false) }
                  }}
                  placeholder="Número do BI / passaporte" />
              </div>
              {biChecking && <p className="hint" style={{ marginTop: 6 }}>A verificar…</p>}
              {biKnown ? (
                <div className="bi-known"><i className="ti ti-circle-check" aria-hidden="true"></i> Já temos este documento{biKnown.name ? ` (${biKnown.name})` : ''} — não é preciso fotografar outra vez.</div>
              ) : biNumber.trim().length >= 4 && (
                <>
                  <p className="hint" style={{ marginTop: 8, marginBottom: 8 }}>Documento novo — tire uma foto para o registarmos (só desta vez).</p>
                  <button className={`photo-slot km ${idDoc ? 'done' : ''}`} onClick={() => takePhoto('__iddoc__')}>
                    {idDoc ? <img src={URL.createObjectURL(idDoc)} alt="documento" /> : <span className="photo-icon"><i className="ti ti-id" aria-hidden="true"></i></span>}
                    <span>Documento</span>
                  </button>
                </>
              )}
            </>
          )}

          <label className="fl" style={{ marginTop: 14 }}>Assinatura {signerIsOwner ? 'do cliente' : 'de quem entrega'} <span className="req">*</span></label>
          <SignaturePad onChange={setSigData} />
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setReviewed(false)} disabled={busy}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext() || busy} onClick={submit}>
              {busy
                ? (progress ? `A enviar ${progress.done}/${progress.total}…` : 'A preparar…')
                : <>Finalizar <i className="ti ti-check" aria-hidden="true"></i></>}
            </button>
          </div>
          {busy && progress && progress.total > 0 && (
            <div className="upload-bar">
              <div className="upload-bar-fill" style={{ width: `${Math.round(progress.done / progress.total * 100)}%` }} />
            </div>
          )}
          {busy && progress && (
            <p className="upload-hint">A enviar fotografias… não feches a aplicação. {progress.done} de {progress.total}.
            {compsize && compsize.before > 0 && ` · Compressão: ${(compsize.before/1048576).toFixed(1)}MB → ${(compsize.after/1048576).toFixed(1)}MB (${Math.round((1-compsize.after/compsize.before)*100)}% menor)`}</p>
          )}
        </section>
      )}
    </main>
  )
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const drawn = useRef(false)

  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = r.width * dpr; c.height = r.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#1A1A18'; ctx.lineWidth = 2.5
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'

    const pos = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const down = (e: PointerEvent) => {
      drawing.current = true; drawn.current = true
      const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y)
      c.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drawing.current) return
      const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke()
    }
    const up = () => {
      drawing.current = false
      if (drawn.current) onChange(c.toDataURL('image/png'))
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
    }
  }, [onChange])

  const clear = () => {
    const c = ref.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    drawn.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas ref={ref} className="sig-canvas" style={{ touchAction: 'none' }} />
      <button className="btn-ghost btn-sm" onClick={clear}>Limpar assinatura</button>
    </div>
  )
}

// ── Lista de recepções ───────────────────────────────────────
const PRIO_LABEL: Record<string, string> = { urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baixa' }
const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  reception: 'Em recepção',
  awaiting_diagnosis: 'Aguarda diagnóstico',
  in_diagnosis: 'Em diagnóstico',
  diagnosis_review: 'Aguarda autorização',
  awaiting_quote: 'Aguarda orçamento',
  quote_sent: 'Orçamento enviado',
  approved: 'Aprovado',
  in_progress: 'Em execução',
  quality_check: 'Controlo de qualidade',
  ready: 'Pronto para levantar',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

function ReceptionList({ onBack, onResume, onOpen, isOwner, onOpenOS, onSign, onComplete, onOpenPPI }: { onBack: () => void; onResume: (id: string) => void; onOpen: (id: string) => void; isOwner: boolean; onOpenOS?: (id: string) => void; onSign?: (id: string) => void; onComplete?: (id: string) => void; onOpenPPI?: (id: string) => void }) {
  const canDelete = useSession(s => s.can('jobdelete:any'))
  const canStatus = useSession(s => s.can('jobdelete:any'))   // mudar estado: só dono, nesta fase
  const [rows, setRows] = useState<any[]>([])
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'diagnosis' | 'working' | 'ready' | 'delivered'>('all')
  const [loading, setLoading] = useState(true)

  const load = (q = '') => {
    setLoading(true)
    api(`/api/v1/receptions${q ? `?search=${encodeURIComponent(q)}` : ''}`)
      .then(r => setRows(r.data)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const exportPdf = async (joId: string) => {
    setPdfBusy(joId)
    try {
      const r = await api(`/api/v1/receptions/${joId}/pdf`)
      if (r.url) window.open(r.url, '_blank')
    } catch { alert('Não foi possível gerar o PDF agora.') }
    finally { setPdfBusy(null) }
  }

  const remove = async (jo: any) => {
    const hard = confirm(`Apagar DEFINITIVAMENTE a entrada ${jo.number}?\n\nOK = apagar de vez (para testes)\nCancelar = manter`)
    if (!hard) return
    try {
      await api(`/api/v1/receptions/${jo.id}?hard=true`, { method: 'DELETE' })
      setRows(rs => rs.filter(r => r.id !== jo.id))
    } catch { alert('Não foi possível apagar.') }
  }

  const STATUS_FLOW = ['awaiting_diagnosis','awaiting_quote','quote_sent','approved','in_progress','quality_check','ready','delivered']
  const changeStatus = async (jo: any) => {
    const options = STATUS_FLOW.map((s, i) => `${i + 1}. ${STATUS_LABEL[s]}`).join('\n')
    const pick = prompt(`Mudar estado de ${jo.number}\nActual: ${STATUS_LABEL[jo.status] || jo.status}\n\n${options}\n\nEscreve o número do novo estado:`)
    if (!pick) return
    const idx = Number(pick.trim()) - 1
    if (idx < 0 || idx >= STATUS_FLOW.length) { alert('Número inválido.'); return }
    const status = STATUS_FLOW[idx]
    try {
      await api(`/api/v1/receptions/${jo.id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
      setRows(rs => rs.map(r => r.id === jo.id ? { ...r, status } : r))
    } catch { alert('Não foi possível mudar o estado.') }
  }

  // Atalho temporário (só dono): fechar um carro que já saiu, sem passar
  // por todas as fases que ainda não existem no sistema.
  const markDelivered = async (jo: any) => {
    if (!confirm(`Marcar ${jo.number} como finalizada/entregue?\n\nUsa isto para fechar carros já tratados enquanto o ciclo completo não está pronto.`)) return
    try {
      await api(`/api/v1/receptions/${jo.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'delivered' }) })
      setRows(rs => rs.map(r => r.id === jo.id ? { ...r, status: 'delivered' } : r))
    } catch { alert('Não foi possível finalizar.') }
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Recepções</h2><span />
      </div>

      <div className="search-box">
        <i className="ti ti-search" aria-hidden="true"></i>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Procurar por matrícula, cliente ou nº da JO…" />
        {search && <button className="search-clear" onClick={() => setSearch('')}><i className="ti ti-x" aria-hidden="true"></i></button>}
      </div>

      <div className="list-filters">
        {([['all', 'Todos'], ['diagnosis', 'Por diagnosticar'], ['working', 'Em trabalho'], ['ready', 'Prontos'], ['delivered', 'Entregues']] as const).map(([v, l]) => (
          <button key={v} className={`filter-chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      <div className="list">
        {(() => {
          const visible = rows.filter(r => {
            if (filter === 'all') return r.status !== 'delivered' && r.status !== 'cancelled'
            if (filter === 'diagnosis') return r.status === 'awaiting_diagnosis' || r.status === 'in_diagnosis' || r.status === 'diagnosis_review'
            if (filter === 'working') return r.status === 'awaiting_quote' || r.status === 'quote_sent' || r.status === 'approved' || r.status === 'in_progress' || r.status === 'quality_check'
            if (filter === 'ready') return r.status === 'ready'
            if (filter === 'delivered') return r.status === 'delivered'
            return true
          })
          return <>
          {visible.map(r => {
          const isDraft = r.status === 'draft'
          // Faltam fotos obrigatórias? 14 normalmente, 11 se a entrada ficou
          // pendente (as 3 do painel exigem ignição). Serve para qualquer
          // razão de falta, não só a bateria.
          const minFotos = r.entry_pending_reason ? 11 : 14
          // Entrada rápida não tem fotos por desenho — nunca é "incompleta" por isso.
          const isQuick = r.entry_type === 'quick'
          const fotosEmFalta = !isDraft && !isQuick && Number(r.req_photos ?? minFotos) < minFotos
          const incompleta = !isDraft && !isQuick && !r.entry_completed_at && (!!r.entry_pending_reason || fotosEmFalta)
          return (
            <div key={r.id} className={`list-row clickable ${isDraft ? 'is-draft' : ''}`}>
              <span className="jo-num" onClick={() => onOpen(r.id)}>{r.number}</span>
              <span className="plate" onClick={() => onOpen(r.id)}>{r.plate}</span>
              <div className="list-main" onClick={() => onOpen(r.id)}>
                <div className="list-name">{r.customer_name}
                  {(r.priority_level === 'urgent' || r.priority_level === 'high') && <span className={`list-prio p-${r.priority_level}`}>{r.priority_level === 'urgent' ? 'URGENTE' : 'ALTA'}</span>}
                </div>
                <div className="list-sub">{r.brand} {r.model}{isDraft ? '' : ` · ${r.photo_count} fotos${r.signed_at ? ' · assinada' : ''}`}</div>
              </div>
              <div className="list-tags">
              {r.is_non_runner && <span className="badge-nr" title="Entrou sem funcionar"><i className="ti ti-engine-off" aria-hidden="true"></i> Não funciona</span>}
              {incompleta && (
                <span className="badge-incomplete" title={r.entry_pending_reason
                  ? `Falta o km e as fotos do painel — ${r.entry_pending_reason}`
                  : `Faltam ${minFotos - Number(r.req_photos ?? 0)} fotos obrigatórias`}>
                  <i className="ti ti-camera-off" aria-hidden="true"></i> Entrada incompleta
                </span>
              )}
              {isDraft
                ? <span className="badge-draft"><i className="ti ti-device-floppy" aria-hidden="true"></i> Rascunho</span>
                : r.deletion_status === 'pending'
                  ? <span className="badge-del"><i className="ti ti-trash-x" aria-hidden="true"></i> Elim. pendente</span>
                  : !r.signed_at
                    ? <span className="badge-unsigned" title="Finalização não chegou a selar a assinatura"><i className="ti ti-writing-off" aria-hidden="true"></i> Por assinar</span>
                    : <span className={`status s-${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span>}
              </div>
              <div className="list-acts">
              {isDraft && (
                <button className="btn-primary btn-sm" onClick={() => onResume(r.id)} title="Continuar lançamento">
                  Continuar <i className="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              )}
              {incompleta && onComplete && (
                <button className="btn-primary btn-sm" onClick={() => onComplete(r.id)} title="Registar o km e as fotos do painel">
                  <i className="ti ti-battery-charging" aria-hidden="true"></i> Completar entrada
                </button>
              )}
              {!isDraft && !r.signed_at && r.status !== 'delivered' && onSign && (
                <button className="btn-primary btn-sm" onClick={() => onSign(r.id)} title="Completar a assinatura em falta">
                  <i className="ti ti-signature" aria-hidden="true"></i> Assinar agora
                </button>
              )}
              {!isDraft && r.signed_at && r.has_ppi && onOpenPPI && (
                <button className="btn-primary btn-sm" onClick={() => onOpenPPI(r.id)} title="Abrir inspeção PPI"><i className="ti ti-clipboard-search" aria-hidden="true"></i> {r.ppi_id ? 'Continuar PPI' : 'Abrir PPI'}</button>
              )}
              {!isDraft && r.signed_at && r.status !== 'delivered' && onOpenOS && !incompleta && !r.has_ppi && (
                r.os_opened_at
                  ? <button className="btn-ghost btn-sm" onClick={() => onOpenOS(r.id)} title="Ver Ordem de Serviço"><i className="ti ti-clipboard-list" aria-hidden="true"></i> Ver OS</button>
                  : <button className="btn-primary btn-sm" onClick={() => onOpenOS(r.id)} title="Iniciar Ordem de Serviço"><i className="ti ti-tools" aria-hidden="true"></i> Iniciar OS</button>
              )}
              {!isDraft && r.signed_at && (
                <button className="btn-ghost btn-sm" disabled={pdfBusy === r.id} onClick={() => exportPdf(r.id)} title="Exportar PDF de entrada">
                  <i className={`ti ${pdfBusy === r.id ? 'ti-loader' : 'ti-file-type-pdf'}`} aria-hidden="true"></i>
                </button>
              )}
              {!isDraft && canStatus && (
                <button className="btn-ghost btn-sm" onClick={() => changeStatus(r)} title="Mudar estado">
                  <i className="ti ti-adjustments" aria-hidden="true"></i>
                </button>
              )}
              {!isDraft && canStatus && r.status !== 'delivered' && (
                <button className="btn-ghost btn-sm" onClick={() => markDelivered(r)} title="Marcar como finalizada">
                  <i className="ti ti-checkbox" aria-hidden="true"></i>
                </button>
              )}
              {canDelete && (
                <button className="btn-ghost btn-sm danger" onClick={() => remove(r)} title="Apagar entrada">
                  <i className="ti ti-trash" aria-hidden="true"></i>
                </button>
              )}
              </div>
            </div>
          )
        })}
        {!loading && visible.length === 0 && <p className="empty">{search ? 'Nada encontrado para essa pesquisa.' : rows.length === 0 ? 'Ainda sem recepções.' : 'Nenhum carro neste filtro.'}</p>}
          </>
        })()}
      </div>
    </main>
  )
}

// ── DETALHE DA RECEPÇÃO (ver informação registada) ───────────
function ReceptionDetail({ joId, onBack, onResume, isOwner, onOpenOther, onOpenOS }: { joId: string; onBack: () => void; onResume: (id: string) => void; isOwner: boolean; onOpenOther?: (id: string) => void; onOpenOS?: (id: string) => void }) {
  const [jo, setJo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [photo, setPhoto] = useState<string | null>(null)  // foto ampliada
  const [delReason, setDelReason] = useState('')
  const [showDelForm, setShowDelForm] = useState(false)
  const [criteria, setCriteria] = useState<any[]>([])
  const [showPrioForm, setShowPrioForm] = useState(false)
  const [prioLevel, setPrioLevel] = useState('normal')
  const [prioReason, setPrioReason] = useState('')
  const [prioNote, setPrioNote] = useState('')

  useEffect(() => {
    api(`/api/v1/receptions/${joId}`).then((d) => {
      setJo(d)
      if (d.priority_level) setPrioLevel(d.priority_level)
      if (d.priority_reason) setPrioReason(d.priority_reason)
      if (d.priority_reason_note) setPrioNote(d.priority_reason_note)
    }).catch(() => {}).finally(() => setLoading(false))
    api('/api/v1/reception-config').then(r => setCriteria(r.priorityCriteria || [])).catch(() => {})
  }, [joId])

  if (loading) return <main className="reception"><p className="empty">A carregar…</p></main>
  if (!jo) return <main className="reception"><p className="empty">Não foi possível carregar.</p></main>

  const isDraft = jo.status === 'draft'
  const asArr = (v: any) => typeof v === 'string' ? (() => { try { return JSON.parse(v) } catch { return [] } })() : (v || [])
  const asObj = (v: any) => typeof v === 'string' ? (() => { try { return JSON.parse(v) } catch { return {} } })() : (v || {})
  const intentions: string[] = asArr(jo.intentions)
  const damages: any[] = asArr(jo.damage_zones)
  // Sistemas verificados à entrada — só mostra os que foram mesmo avaliados.
  const sysRaw = typeof jo.systems_check === 'string' ? JSON.parse(jo.systems_check || '{}') : (jo.systems_check || {})
  const sysEntries: [string, string][] = Object.entries(sysRaw).filter(([, v]) => !!v) as [string, string][]
  // Fotos por zona, para se poder mostrar cada uma com o seu nome e ver
  // quais faltam. As que não são de zona conhecida (danos, extras) vão à parte.
  const porZona: Record<string, any> = {}
  for (const p of (jo?.photos || [])) if (p.url) porZona[p.zone] = p
  const emFalta = ALL_ZONES.filter(z => !porZona[z.key])
  const outras = (jo?.photos || []).filter((p: any) => p.url && !ZONE_LABEL[p.zone])
  const checklist = asObj(jo.checklist)
  const items = Object.keys(checklist).filter(k => checklist[k])
  const fmt = (s?: string) => s ? new Date(s).toLocaleString('pt-PT') : '—'
  const fuel = jo.fuel_level != null ? `${Math.round(jo.fuel_level / 8 * 100)}%` : '—'

  const Row = ({ label, value }: { label: string; value: any }) => (
    <div className="det-row"><span>{label}</span><strong>{value || '—'}</strong></div>
  )

  return (
    <main className="reception">
      {photo && (
        <div className="photo-viewer" onClick={() => setPhoto(null)}>
          <img src={photo} alt="foto" />
          <button className="photo-viewer-close"><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
      )}

      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{jo.number}</h2>
        {isDraft
          ? <button className="btn-primary btn-sm" onClick={() => onResume(joId)}>Continuar <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          : <span />}
      </div>

      {isDraft && <div className="det-banner"><i className="ti ti-device-floppy" aria-hidden="true"></i> Rascunho — lançamento por concluir</div>}

      <div className="det-section">
        <div className="det-section-title">Estado</div>
        <Row label="Situação" value={STATUS_LABEL[jo.status] || jo.status} />
        {jo.os_opened_at && onOpenOS && (
          <button className="det-link" onClick={() => onOpenOS(joId)}>
            <i className="ti ti-clipboard-list" aria-hidden="true"></i>
            <span>Ver a Ordem de Serviço deste carro</span>
            <i className="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        )}
        {jo.booking_date && <Row label="Marcação" value={fmt(jo.booking_date)} />}
        {jo.received_at && !isDraft && <Row label="Entrada" value={fmt(jo.received_at)} />}
        {jo.signer_is_owner === false && jo.signer_name && <Row label="Entregue por" value={`${jo.signer_name} (não é o dono)`} />}
        {jo.received_by_name && <Row label="Finalizada por" value={jo.received_by_name} />}
        {jo.draft_created_by_name && jo.draft_created_by_name !== jo.received_by_name && (
          <Row label="Iniciada por" value={jo.draft_created_by_name} />
        )}
      </div>

      {!isDraft && (
        <div className="det-section">
          <div className="det-section-title">Prioridade</div>
          {jo.priority_level ? (
            <>
              <div className="prio-current">
                <span className={`prio-badge p-${jo.priority_level}`}>{PRIO_LABEL[jo.priority_level]}</span>
                <span className="prio-reason">{jo.priority_reason}{jo.priority_reason_note ? ` — ${jo.priority_reason_note}` : ''}</span>
              </div>
              {jo.priority_corrected_at && <p className="det-notes">Prioridade corrigida pela Direcção.</p>}
            </>
          ) : <p className="det-empty">Sem prioridade definida.</p>}

          {!showPrioForm ? (
            <button className="btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowPrioForm(true)}>
              <i className="ti ti-flag" aria-hidden="true"></i> {jo.priority_level ? 'Alterar prioridade' : 'Definir prioridade'}
            </button>
          ) : (
            <div className="prio-form">
              <label className="fl">Nível</label>
              <div className="prio-levels">
                {[['urgent', 'Urgente'], ['high', 'Alta'], ['normal', 'Normal'], ['low', 'Baixa']].map(([v, l]) => (
                  <button key={v} className={`prio-lvl p-${v} ${prioLevel === v ? 'on' : ''}`} onClick={() => setPrioLevel(v)}>{l}</button>
                ))}
              </div>
              <label className="fl" style={{ marginTop: 12 }}>Razão <span className="req">*</span></label>
              <select value={prioReason} onChange={e => setPrioReason(e.target.value)}>
                <option value="">Escolher critério…</option>
                {criteria.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                <option value="__outro__">Outro (especificar)</option>
              </select>
              {prioReason === '__outro__' && (
                <input style={{ marginTop: 8 }} value={prioNote} onChange={e => setPrioNote(e.target.value)} placeholder="Qual a razão?" />
              )}
              {prioReason && prioReason !== '__outro__' && (
                <input style={{ marginTop: 8 }} value={prioNote} onChange={e => setPrioNote(e.target.value)} placeholder="Nota (opcional)" />
              )}
              <div className="rec-nav">
                <button className="btn-ghost" onClick={() => setShowPrioForm(false)}>Voltar</button>
                <button className="btn-primary" disabled={!prioReason || (prioReason === '__outro__' && !prioNote.trim())} onClick={async () => {
                  try {
                    const reason = prioReason === '__outro__' ? 'Outro' : prioReason
                    await api(`/api/v1/receptions/${joId}/priority`, { method: 'POST', body: JSON.stringify({ level: prioLevel, reason, note: prioNote || undefined }) })
                    setShowPrioForm(false)
                    api(`/api/v1/receptions/${joId}`).then(setJo).catch(() => {})
                  } catch { alert('Não foi possível definir a prioridade.') }
                }}>Guardar</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="det-section">
        <div className="det-section-title">Cliente</div>
        <Row label="Nome" value={jo.customer_name} />
        <Row label="Contacto" value={jo.customer_phone} />
      </div>

      <div className="det-section">
        <div className="det-section-title">Viatura</div>
        <Row label="Marca / Modelo" value={`${jo.brand || ''} ${jo.model || ''}`.trim()} />
        <Row label="Matrícula" value={jo.plate} />
        {jo.year && <Row label="Ano" value={jo.year} />}
        {jo.color && <Row label="Cor" value={jo.color} />}
        {jo.vin && <Row label="VIN / Chassi" value={jo.vin} />}
        <Row label="Quilometragem" value={
          jo.km_entry != null ? `${MZmt(jo.km_entry)} km`
            : jo.entry_pending_reason ? 'Por registar' : '—'} />
        <Row label="Combustível" value={fuel} />
        {jo.battery_reference && <Row label="Referência da bateria" value={jo.battery_reference} />}
        {jo.is_non_runner && <Row label="Entrou a funcionar?" value="Não — entrou sem funcionar" />}
      </div>

      {jo.servicos?.length > 0 && (
        <div className="det-section">
          <div className="det-section-title">Serviços</div>
          <div className="det-chips">
            {jo.servicos.map((sv: any) => (
              <span key={sv.id} className="svc-chip">
                <i className="ti ti-tool" aria-hidden="true"></i> {sv.type_name}
              </span>
            ))}
          </div>
          {jo.client_presence && (
            <Row label="Cliente" value={jo.client_presence === 'waits' ? 'Esperou pelo carro' : 'Deixou o carro'} />
          )}
        </div>
      )}

      <div className="det-section">
        <div className="det-section-title">Intenção do cliente</div>
        {intentions.length
          ? <div className="det-chips">{intentions.map((it, i) => <span key={i} className="review-chip">{it}</span>)}</div>
          : <p className="det-empty">—</p>}
        {jo.service_description && <p className="det-notes">{jo.service_description}</p>}
      </div>

      <div className="det-section">
        <div className="det-section-title">Estado e itens declarados</div>
        <Row label="Itens presentes" value={items.length ? items.join(', ') : 'Nenhum'} />
        <Row label="Objectos declarados" value={jo.declared_valuables} />
        {jo.wants_old_parts != null && (
          <Row label="Quer as peças antigas?" value={jo.wants_old_parts ? 'Sim — guardar e devolver' : 'Não'} />
        )}
      </div>

      {/* Verificação de sistemas à entrada — é isto que responde a
          "o ar condicionado já não funcionava quando o carro chegou". */}
      {sysEntries.length > 0 && (
        <div className="det-section">
          <div className="det-section-title">Sistemas verificados à entrada</div>
          <div className="sys-det">
            {sysEntries.map(([nome, estado]) => (
              <div key={nome} className={`sys-det-row v-${estado}`}>
                <span className="sys-det-name">{nome}</span>
                <span className="sys-det-val">
                  <i className={`ti ${estado === 'ok' ? 'ti-check' : estado === 'fail' ? 'ti-x' : 'ti-minus'}`} aria-hidden="true"></i>
                  {estado === 'ok' ? 'Funciona' : estado === 'fail' ? 'Não funciona' : 'Não testado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {jo.entry_pending_reason && (
        <div className="det-section">
          <div className="det-section-title">Entrada incompleta</div>
          <Row label="Motivo" value={jo.entry_pending_reason} />
          <Row label="Completada" value={jo.entry_completed_at ? fmt(jo.entry_completed_at) : 'Ainda não'} />
          {jo.entry_completed_by_name && <Row label="Por" value={jo.entry_completed_by_name} />}
        </div>
      )}

      {damages.length > 0 && (
        <div className="det-section">
          <div className="det-section-title">Danos registados</div>
          {damages.map((d, i) => (
            <div key={i} className="review-damage">
              <span className="review-damage-n">{i + 1}</span>
              <span>{d.area}{d.note ? ` — ${d.note}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {jo.photos && jo.photos.length > 0 && (
        <div className="det-section">
          <div className="det-section-title">
            Fotos da entrada ({jo.photos.length})
            {emFalta.length > 0 && <span className="fotos-falta">{emFalta.length} em falta</span>}
          </div>

          {/* Obrigatórias, pela ordem em que se tiram, com o nome à vista.
              Sem legenda ninguém sabe qual é a bateria no meio de 14 miniaturas
              — nem repara se falta alguma. */}
          <div className="foto-grid">
            {ALL_ZONES.map(z => {
              const p = porZona[z.key]
              return p?.url ? (
                <button key={z.key} className="foto-card" onClick={() => setPhoto(p.url)}>
                  <img src={p.url} alt={z.label} />
                  <span className="foto-nome">{z.label}</span>
                </button>
              ) : (
                <div key={z.key} className="foto-card vazio">
                  <span className="foto-icon"><i className="ti ti-camera-off" aria-hidden="true"></i></span>
                  <span className="foto-nome">{z.label}</span>
                </div>
              )
            })}
          </div>

          {outras.length > 0 && (
            <>
              <div className="foto-sub">Outras fotos ({outras.length})</div>
              <div className="foto-grid">
                {outras.map((p: any) => (
                  <button key={p.id} className="foto-card" onClick={() => setPhoto(p.url)}>
                    <img src={p.url} alt={zoneName(p.zone)} />
                    <span className="foto-nome">{zoneName(p.zone)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {(jo.historico?.length > 0) && (
        <div className="det-section">
          <div className="det-section-title">Outras visitas deste carro ({jo.historico.length})</div>
          <div className="hist-list">
            {jo.historico.map((h: any) => {
              const its = asArr(h.intentions)
              return (
                <button key={h.id} className="hist-row" onClick={() => onOpenOther?.(h.id)}>
                  <div className="hist-main">
                    <div className="hist-top">
                      <span className="hist-num">{h.number}</span>
                      <span className={`status s-${h.status}`}>{STATUS_LABEL[h.status] || h.status}</span>
                    </div>
                    <div className="hist-sub">
                      {h.received_at ? fmt(h.received_at) : 'Sem data'}
                      {h.km_entry != null ? ` · ${MZmt(h.km_entry)} km` : ''}
                    </div>
                    {its.length > 0 && <div className="hist-what">{its.join(' · ')}</div>}
                  </div>
                  <i className="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(jo.idDocViewUrl || jo.signer_bi_number) && (
        <div className="det-section">
          <div className="det-section-title">Documento de identificação</div>
          {jo.signer_bi_number && <Row label="Número" value={jo.signer_bi_number} />}
          {jo.idDocViewUrl && (
            <button className="det-iddoc" onClick={() => setPhoto(jo.idDocViewUrl)} title="Ver documento">
              <img src={jo.idDocViewUrl} alt="Documento de identificação" />
            </button>
          )}
        </div>
      )}

      {(jo.terms_accepted_at || jo.non_runner_accepted_at) && (
        <div className="det-section">
          <div className="det-section-title">Termos aceites</div>
          {jo.terms_accepted_at && (
            <Row label={`Termos gerais${jo.terms_version ? ` (v${jo.terms_version})` : ''}`} value={fmt(jo.terms_accepted_at)} />
          )}
          {jo.non_runner_accepted_at && (
            <Row label="Termos de veículo sem funcionar" value={fmt(jo.non_runner_accepted_at)} />
          )}
        </div>
      )}

      {jo.signatureViewUrl && (
        <div className="det-section">
          <div className="det-section-title">Assinatura do cliente</div>
          <img src={jo.signatureViewUrl} alt="assinatura" className="det-signature" />
          {jo.terms_version && <p className="det-notes">Termos v{jo.terms_version} · aceites em {fmt(jo.terms_accepted_at)}</p>}
        </div>
      )}

      {!isDraft && jo.signed_at && (
        <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={async () => { try { const r = await api(`/api/v1/receptions/${joId}/pdf`); if (r.url) window.open(r.url, '_blank') } catch { alert('Não foi possível abrir o PDF.') } }}>
          <i className="ti ti-file-type-pdf" aria-hidden="true"></i> Ver documento de entrada (PDF)
        </button>
      )}

      {/* Eliminação */}
      {jo.deletion_status === 'pending' ? (
        <div className="del-pending">
          <div className="del-pending-head"><i className="ti ti-clock-exclamation" aria-hidden="true"></i> Eliminação pendente de aprovação</div>
          <p className="det-notes">Motivo: {jo.deletion_reason}{jo.deletion_requested_by_name ? ` · pedido por ${jo.deletion_requested_by_name}` : ''}</p>
          {isOwner && (
            <div className="rec-nav">
              <button className="btn-ghost danger" onClick={async () => { if (confirm('Recusar o pedido de eliminação?')) { try { await api(`/api/v1/receptions/${joId}/decide-deletion`, { method: 'POST', body: JSON.stringify({ approve: false }) }); onBack() } catch { alert('Erro.') } } }}>Recusar</button>
              <button className="btn-primary" onClick={async () => { if (confirm('Aprovar a eliminação? A entrada será cancelada.')) { try { await api(`/api/v1/receptions/${joId}/decide-deletion`, { method: 'POST', body: JSON.stringify({ approve: true }) }); onBack() } catch { alert('Erro.') } } }}>Aprovar eliminação</button>
            </div>
          )}
        </div>
      ) : showDelForm ? (
        <div className="del-form">
          <label className="fl">Motivo da eliminação <span className="req">*</span></label>
          <input value={delReason} onChange={e => setDelReason(e.target.value)} placeholder="ex: entrada duplicada, dados errados…" />
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setShowDelForm(false)}>Voltar</button>
            <button className="btn-primary" disabled={!delReason.trim()} onClick={async () => {
              try {
                await api(`/api/v1/receptions/${joId}/request-deletion`, { method: 'POST', body: JSON.stringify({ reason: delReason }) })
                alert(isOwner ? 'Pedido registado. Como dono, podes aprová-lo já.' : 'Pedido de eliminação enviado para aprovação.')
                setShowDelForm(false); setDelReason('')
                api(`/api/v1/receptions/${joId}`).then(setJo).catch(() => {})
              } catch (e: any) { alert(e?.message || 'Não foi possível pedir a eliminação.') }
            }}>Pedir eliminação</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowDelForm(true)}>
          <i className="ti ti-trash" aria-hidden="true"></i> {isOwner ? 'Eliminar entrada' : 'Pedir eliminação'}
        </button>
      )}
    </main>
  )
}

// ── COMPLETAR ENTRADA (km + painel que ficaram pendentes) ────
// A entrada fechou e assinou sem o km porque o carro não ligava.
// O cliente já foi — o carro está cá. Aqui acaba-se o que faltava.
function CompleteEntry({ joId, onBack, onDone }: { joId: string; onBack: () => void; onDone: () => void }) {
  const [jo, setJo] = useState<any>(null)
  const [km, setKm] = useState('')
  const [shots, setShots] = useState<Record<string, Blob>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingZone = useRef<string | null>(null)

  const load = () => api(`/api/v1/receptions/${joId}`).then(setJo).catch(() => {})
  useEffect(() => { load() }, [joId])

  // Que fotos do painel já lá estão (podem ter sido tiradas noutra sessão)
  const already = new Set<string>((jo?.photos || []).map((p: any) => p.zone))
  const missing = DASH_ZONES.filter(z => !already.has(z.key) && !shots[z.key])
  const kmJaLa = jo?.km_entry != null            // pode já ter sido registado
  const canSave = missing.length === 0 && (kmJaLa || (V.km(km) && km.trim().length > 0))

  const takePhoto = (zone: string) => { pendingZone.current = zone; fileRef.current?.click() }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; const zone = pendingZone.current
    if (!f || !zone) return
    const img = await compressImage(f)
    setShots(s => ({ ...s, [zone]: img }))
    e.target.value = ''
  }

  const save = async () => {
    if (!canSave || busy) return
    setBusy(true); setErr(null)
    try {
      for (const [zone, blob] of Object.entries(shots)) {
        if (already.has(zone)) continue
        await uploadPhoto(joId, zone, blob, { isRequired: true })
      }
      await api(`/api/v1/receptions/${joId}/complete-entry`, {
        method: 'POST', body: JSON.stringify({ kmEntry: km ? Number(km) : undefined }),
      })
      onDone()
    } catch (e: any) { setErr(e?.message || 'Não foi possível completar.') }
    finally { setBusy(false) }
  }

  if (!jo) return <main className="reception"><p className="empty">A carregar…</p></main>

  return (
    <main className="reception">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Completar entrada</h2><span />
      </div>

      <div className="pending-box">
        <div className="pending-head"><i className="ti ti-camera-off" aria-hidden="true"></i> Ficou por registar à entrada</div>
        {jo.entry_pending_reason
          ? <p>Motivo: <strong>{jo.entry_pending_reason}</strong></p>
          : <p>Esta entrada foi selada sem todas as fotos obrigatórias.</p>}
        <p>Falta{missing.length === 1 ? '' : 'm'} {missing.length} foto{missing.length === 1 ? '' : 's'} do painel{kmJaLa ? '' : ' e o km'}. Assim que estiver{missing.length === 1 ? '' : 'em'}, a OS pode arrancar.</p>
      </div>

      <div className="sign-summary">
        <div><strong>{jo.number}</strong> · {jo.plate} · {jo.brand} {jo.model}</div>
        <div className="hint">Entrou em {jo.received_at ? new Date(jo.received_at).toLocaleDateString('pt-PT') : '—'}</div>
      </div>

      {kmJaLa ? (
        <div className="sign-summary" style={{ marginTop: 16 }}>
          <div>Km já registados: <strong>{MZmt(jo.km_entry)} km</strong></div>
        </div>
      ) : (
        <>
          <label className="fl" style={{ marginTop: 16 }}>Km actuais <span className="req">*</span></label>
          <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} placeholder="ex: 87340" />
          {km.length > 0 && !V.km(km) && <div className="field-warn">Km inválidos.</div>}
        </>
      )}

      <label className="fl" style={{ marginTop: 16 }}>Painel e conta-km <span className="req">*</span></label>
      <div className="dash-grid">
        {DASH_ZONES.map(z => {
          const have = already.has(z.key) || !!shots[z.key]
          return (
            <button key={z.key} className={`photo-slot dash ${have ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
              {shots[z.key] ? <img src={URL.createObjectURL(shots[z.key])} alt="" />
                : have ? <span className="photo-icon"><i className="ti ti-check" aria-hidden="true"></i></span>
                : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
              <span>{z.label}</span>
              {z.hint && <em>{z.hint}</em>}
            </button>
          )
        })}
      </div>

      {err && <div className="field-warn" style={{ marginTop: 12 }}>{err}</div>}

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}
        disabled={!canSave || busy} onClick={save}>
        {busy ? 'A guardar…' : <>Completar entrada <i className="ti ti-check" aria-hidden="true"></i></>}
      </button>
    </main>
  )
}

// ── MUDAR A MINHA SENHA ──────────────────────────────────────
// Tira à Direcção o trabalho de repor senhas por SQL. Essencial
// antes de qualquer oficina externa entrar.
// ── FILA DE SINCRONIZAÇÃO (o que está preso, e porquê) ───────
// Antes, uma entrada presa na fila era invisível: um contador dizia
// "a sincronizar 1…" para sempre, sem dizer o quê nem porquê. Isto
// abre a caixa — mostra o que falta subir, o erro, e deixa forçar
// o envio ou descartar o que é irrecuperável.
// ── GESTÃO DE TIPOS DE SERVIÇO (só dono) ─────────────────────
// Primeira peça do painel de gestão: a oficina cria, edita e
// desactiva os seus tipos de serviço. Vem com base semeada, mas
// nada fixo. Desactivar não apaga — o histórico mantém-se.
function ServiceTypes({ onBack }: { onBack: () => void }) {
  const [types, setTypes] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)   // tipo a editar, ou {} para novo
  const [name, setName] = useState('')
  const [presence, setPresence] = useState('leaves')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  const load = () => api('/api/v1/service-types?all=1').then(r => setTypes(r.data || [])).catch(() => {})
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing({}); setName(''); setPresence('leaves') }
  const openEdit = (t: any) => { setEditing(t); setName(t.name); setPresence(t.client_presence) }
  const close = () => { setEditing(null); setName(''); setPresence('leaves') }

  const save = async () => {
    if (name.trim().length < 2) return
    setBusy(true); setMsg(null)
    try {
      if (editing.id) await api(`/api/v1/service-types/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name, clientPresence: presence }) })
      else await api('/api/v1/service-types', { method: 'POST', body: JSON.stringify({ name, clientPresence: presence }) })
      close(); await load()
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Não foi possível guardar.' }) }
    finally { setBusy(false) }
  }

  const toggleActive = async (t: any) => {
    try { await api(`/api/v1/service-types/${t.id}`, { method: 'PATCH', body: JSON.stringify({ active: !t.active }) }); await load() }
    catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Erro.' }) }
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Tipos de serviço</h2><span />
      </div>

      {msg && <Banner msg={msg} onClose={() => setMsg(null)} />}

      {editing ? (
        <div className="task-form">
          <div className="form-mode"><i className="ti ti-tool" aria-hidden="true"></i> {editing.id ? 'Editar tipo' : 'Novo tipo de serviço'}</div>
          <label className="fl">Nome <span className="req">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Reprogramação / Remap" />

          <label className="fl" style={{ marginTop: 14 }}>Por omissão, o cliente…</label>
          <div className="seg-row">
            <button className={`seg ${presence === 'waits' ? 'on' : ''}`} onClick={() => setPresence('waits')}>Espera pelo carro</button>
            <button className={`seg ${presence === 'leaves' ? 'on' : ''}`} onClick={() => setPresence('leaves')}>Deixa o carro</button>
          </div>

          <div className="rec-nav">
            <button className="btn-ghost" onClick={close}>Cancelar</button>
            <button className="btn-primary" disabled={busy || name.trim().length < 2} onClick={save}>
              {busy ? 'A guardar…' : editing.id ? 'Guardar' : 'Criar tipo'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>
            Estes são os serviços que a oficina oferece. Aparecem à entrada, para o Yury escolher.
            Desactivar um tipo tira-o da lista de escolha, mas mantém o histórico dos carros que já o usaram.
          </p>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} onClick={openNew}>
            <i className="ti ti-plus" aria-hidden="true"></i> Novo tipo de serviço
          </button>

          <div className="stype-list">
            {types.map(t => (
              <div key={t.id} className={`stype-row ${!t.active ? 'off' : ''}`}>
                <div className="stype-main" onClick={() => openEdit(t)}>
                  <div className="stype-name">{t.name}{!t.active && <span className="stype-off-tag">desactivado</span>}</div>
                  <div className="stype-sub">Por omissão: {t.client_presence === 'waits' ? 'cliente espera' : 'deixa o carro'}</div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => toggleActive(t)} title={t.active ? 'Desactivar' : 'Reactivar'}>
                  <i className={`ti ${t.active ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true"></i>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

// ── GESTÃO DE TIPOS DE SERVIÇO acaba aqui ────────────────────
// ── CIRCUITO PPI — inspeção com autosave (nada se perde) ─────
// Cada campo guarda-se assim que perde o foco ou muda. Se o
// telemóvel morre a meio, o que já foi metido está no servidor.
function PPICircuit({ joId, onBack }: { joId: string; onBack: () => void }) {
  const [insp, setInsp] = useState<any>(null)
  const [tree, setTree] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [openSec, setOpenSec] = useState<string | null>(null)

  useEffect(() => {
    api('/api/v1/ppi/start', { method: 'POST', body: JSON.stringify({ jobOrderId: joId, level: 'standard' }) })
      .then(async (i) => {
        setInsp(i)
        const [tpl, full] = await Promise.all([
          api(`/api/v1/ppi/template?level=${i.level}`),
          api(`/api/v1/ppi/${i.id}`),
        ])
        setTree(tpl.sections || [])
        if (tpl.sections?.[0]) setOpenSec(tpl.sections[0].id)
        const map: Record<string, any> = {}
        for (const a of (full.answers || [])) if (a.field_id) map[a.field_id] = {
          state: a.value_state, number: a.value_number, text: a.value_text, url: a.value_url,
        }
        setAnswers(map)
      })
      .catch(e => setMsg({ kind: 'err', text: e?.message || 'Nao foi possivel abrir a inspecao.' }))
  }, [joId])

  const saveField = async (fieldId: string, pointId: string, patch: any) => {
    setAnswers(a => ({ ...a, [fieldId]: { ...a[fieldId], ...patch } }))
    setSaving(s => ({ ...s, [fieldId]: true }))
    try {
      const cur = { ...(answers[fieldId] || {}), ...patch }
      await api(`/api/v1/ppi/${insp.id}/answer`, { method: 'PUT', body: JSON.stringify({
        fieldId, pointId,
        valueState: cur.state ?? null,
        valueNumber: cur.number != null && cur.number !== '' ? Number(cur.number) : null,
        valueText: cur.text ?? null,
      }) })
    } catch { setMsg({ kind: 'err', text: 'Uma resposta nao guardou. Verifica a ligacao.' }) }
    finally { setSaving(s => ({ ...s, [fieldId]: false })) }
  }

  const attach = async (fieldId: string, pointId: string, file: File) => {
    setSaving(s => ({ ...s, [fieldId]: true }))
    try {
      const pre = await api(`/api/v1/ppi/${insp.id}/attach/presign`, { method: 'POST',
        body: JSON.stringify({ fieldId, contentType: file.type || 'application/octet-stream' }) })
      await fetch(pre.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      await api(`/api/v1/ppi/${insp.id}/answer`, { method: 'PUT',
        body: JSON.stringify({ fieldId, pointId, valuePath: pre.path }) })
      const full = await api(`/api/v1/ppi/${insp.id}`)
      const a = (full.answers || []).find((x: any) => x.field_id === fieldId)
      setAnswers(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], url: a?.value_url } }))
    } catch { setMsg({ kind: 'err', text: 'O anexo nao subiu.' }) }
    finally { setSaving(s => ({ ...s, [fieldId]: false })) }
  }

  const STATES = [
    { v: 'bom', label: 'Bom', cls: 'bom' }, { v: 'aceitavel', label: 'Aceitavel', cls: 'acc' },
    { v: 'mau', label: 'Mau', cls: 'mau' }, { v: 'na', label: 'N.A.', cls: 'na' },
  ]

  if (!insp) return (
    <main className="reception"><div className="rec-top"><button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button><h2 style={{ margin: 0, fontSize: 18 }}>PPI</h2><span /></div>
      {msg ? <Banner msg={msg} onClose={() => setMsg(null)} /> : <p className="hint" style={{ marginTop: 20 }}>A abrir inspecao...</p>}</main>
  )

  const done = tree.reduce((n, s) => n + s.points.reduce((m: number, p: any) =>
    m + p.fields.filter((f: any) => { const a = answers[f.id]; return a && (a.state || a.number != null || a.text || a.url) }).length, 0), 0)
  const total = tree.reduce((n, s) => n + s.points.reduce((m: number, p: any) => m + p.fields.length, 0), 0)

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 12 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Inspecao PPI</h2><span />
      </div>
      {msg && <Banner msg={msg} onClose={() => setMsg(null)} />}

      <div className="ppi-head">
        <div>
          <div className="ppi-veh">{insp.plate} - {insp.brand} {insp.model}</div>
          <div className="ppi-cust">{insp.customer_name} - {insp.jo_number}</div>
        </div>
        <div className="ppi-level">
          {['basic', 'standard', 'premium'].map(l => (
            <button key={l} className={`ppi-lvl ${insp.level === l ? 'on' : ''}`}
              onClick={async () => {
                await api(`/api/v1/ppi/${insp.id}/level`, { method: 'PATCH', body: JSON.stringify({ level: l }) })
                const tpl = await api(`/api/v1/ppi/template?level=${l}`)
                setTree(tpl.sections || []); setInsp({ ...insp, level: l })
              }}>
              {l === 'basic' ? 'Basico' : l === 'standard' ? 'Standard' : 'Premium'}
            </button>
          ))}
        </div>
      </div>
      <div className="ppi-progress"><div className="ppi-progress-bar" style={{ width: total ? `${Math.round(done / total * 100)}%` : '0%' }} /></div>
      <p className="hint" style={{ marginBottom: 14 }}>{done} de {total} campos preenchidos. Guarda-se sozinho a medida que preenches.</p>

      {tree.map(sec => (
        <div key={sec.id} className="ppi-section">
          <button className="ppi-sec-head" onClick={() => setOpenSec(openSec === sec.id ? null : sec.id)}>
            <span>{sec.name}</span>
            <i className={`ti ti-chevron-${openSec === sec.id ? 'up' : 'down'}`} aria-hidden="true"></i>
          </button>
          {openSec === sec.id && (
            <div className="ppi-sec-body">
              {sec.points.map((pt: any) => (
                <div key={pt.id} className="ppi-point">
                  <div className="ppi-point-name">{pt.name}</div>
                  {pt.fields.map((f: any) => {
                    const a = answers[f.id] || {}
                    const busy = saving[f.id]
                    return (
                      <div key={f.id} className="ppi-field">
                        <label className="ppi-field-label">{f.label}{f.unit ? ` (${f.unit})` : ''}{busy && <span className="ppi-saving">a guardar...</span>}</label>
                        {f.field_type === 'state' && (
                          <div className="ppi-states">
                            {STATES.map(st => (
                              <button key={st.v} className={`ppi-state ${st.cls} ${a.state === st.v ? 'on' : ''}`}
                                onClick={() => saveField(f.id, pt.id, { state: st.v })}>{st.label}</button>
                            ))}
                          </div>
                        )}
                        {f.field_type === 'number' && (
                          <input type="number" inputMode="decimal" defaultValue={a.number ?? ''} placeholder={f.unit || 'valor'}
                            onBlur={e => saveField(f.id, pt.id, { number: e.target.value })} />
                        )}
                        {f.field_type === 'text' && (
                          <textarea rows={2} defaultValue={a.text ?? ''} placeholder="nota..."
                            onBlur={e => saveField(f.id, pt.id, { text: e.target.value })} />
                        )}
                        {(f.field_type === 'photo' || f.field_type === 'file') && (
                          <div className="ppi-attach">
                            {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="ppi-attach-view"><i className="ti ti-paperclip" aria-hidden="true"></i> Ver anexo</a>}
                            <label className="btn-ghost btn-sm">
                              <i className={`ti ${f.field_type === 'photo' ? 'ti-camera' : 'ti-file-upload'}`} aria-hidden="true"></i> {a.url ? 'Substituir' : (f.field_type === 'photo' ? 'Foto' : 'Ficheiro')}
                              <input type="file" accept={f.field_type === 'photo' ? 'image/*' : 'application/pdf,image/*'} {...(f.field_type === 'photo' ? { capture: 'environment' } : {})} style={{ display: 'none' }}
                                onChange={e => { const file = e.target.files?.[0]; if (file) attach(f.id, pt.id, file) }} />
                            </label>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}
        onClick={async () => { await api(`/api/v1/ppi/${insp.id}/done`, { method: 'POST' }); setMsg({ kind: 'ok', text: 'Inspecao marcada como concluida. Ja esta tudo guardado.' }) }}>
        Concluir inspecao <i className="ti ti-circle-check" aria-hidden="true"></i>
      </button>
      <p className="hint" style={{ marginTop: 8, textAlign: 'center' }}>O relatorio em PDF vem no proximo pacote.</p>
    </main>
  )
}

function SyncQueue({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = () => offline.listQueue().then(setItems)
  useEffect(() => { load() }, [])

  const forcar = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await offline.syncAll()
      setMsg(r.ok > 0 ? `${r.ok} enviada(s).` : r.failed > 0 ? 'Continua a falhar — ver o erro abaixo.' : 'Nada para enviar.')
      await load()
    } catch (e: any) { setMsg(e?.message || 'Não foi possível sincronizar.') }
    finally { setBusy(false) }
  }

  const descartar = async (offlineId: string) => {
    if (!confirm('Descartar esta entrada presa? As fotos guardadas por enviar também são apagadas. Não há forma de recuperar depois.')) return
    await offline.discardQueued(offlineId)
    await load()
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Por sincronizar</h2><span />
      </div>

      {items.length === 0 ? (
        <div className="bi-known" style={{ marginTop: 20 }}>
          <i className="ti ti-circle-check" aria-hidden="true"></i> Está tudo sincronizado. Nada preso.
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>
            Estas entradas ainda não subiram ao servidor. Estão guardadas neste aparelho.
            Tenta enviar; se uma falhar sempre por erro irrecuperável, podes descartá-la.
          </p>
          {msg && <div className="banner ok" style={{ marginBottom: 14 }}><i className="ti ti-info-circle" aria-hidden="true"></i><span>{msg}</span></div>}
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} disabled={busy} onClick={forcar}>
            {busy ? 'A enviar…' : <>Tentar enviar tudo agora <i className="ti ti-cloud-upload" aria-hidden="true"></i></>}
          </button>

          <div className="queue-list">
            {items.map(it => (
              <div key={it.offlineId} className="queue-card">
                <div className="queue-main">
                  <div className="queue-title">{it.cliente} · {it.matricula}</div>
                  <div className="queue-sub">
                    {it.createdAt ? new Date(it.createdAt).toLocaleString('pt-PT') : '—'}
                    {it.fotos > 0 ? ` · ${it.fotos} foto(s)` : ''}
                    {it.attempts > 0 ? ` · ${it.attempts} tentativa(s)` : ''}
                  </div>
                  {it.lastError && <div className="queue-err"><i className="ti ti-alert-triangle" aria-hidden="true"></i> {it.lastError}</div>}
                </div>
                <button className="btn-ghost btn-sm danger" onClick={() => descartar(it.offlineId)} title="Descartar">
                  <i className="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

// ── FILA DE SINCRONIZAÇÃO acaba aqui ─────────────────────────
function ChangePassword({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < 8
  const mismatch = confirm.length > 0 && next !== confirm
  const canSave = current.length > 0 && next.length >= 8 && next === confirm

  const submit = async () => {
    if (!canSave) return
    setBusy(true); setErr(null)
    try {
      await api('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ current, next }) })
      setDone(true)
    } catch (e: any) { setErr(e?.message || 'Não foi possível mudar a senha.') }
    finally { setBusy(false) }
  }

  if (done) return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Senha</h2><span />
      </div>
      <div className="bi-known" style={{ marginTop: 20 }}>
        <i className="ti ti-circle-check" aria-hidden="true"></i> Senha alterada. Use a nova da próxima vez que entrar.
      </div>
    </main>
  )

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Mudar a minha senha</h2><span />
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>A senha é sua e ninguém a vê. Se a esquecer, a Direcção pode repô-la.</p>

      <label className="fl">Senha actual <span className="req">*</span></label>
      <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />

      <label className="fl" style={{ marginTop: 14 }}>Nova senha <span className="req">*</span></label>
      <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
      {tooShort && <div className="field-warn">Mínimo 8 caracteres.</div>}

      <label className="fl" style={{ marginTop: 14 }}>Repetir a nova senha <span className="req">*</span></label>
      <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
      {mismatch && <div className="field-warn">As senhas não coincidem.</div>}

      {err && <div className="field-warn" style={{ marginTop: 12 }}>{err}</div>}

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}
        disabled={!canSave || busy} onClick={submit}>
        {busy ? 'A guardar…' : <>Guardar nova senha <i className="ti ti-check" aria-hidden="true"></i></>}
      </button>
    </main>
  )
}

// ── ASSINAR AGORA (recuperar entrada por assinar) ────────────
// Uma finalização interrompida pode deixar a entrada criada mas sem
// assinatura selada — nem rascunho, nem assinada. Este ecrã completa
// a assinatura sem refazer a recepção: as fotos já lá estão.
// A assinatura é REAL, feita agora, e fica registada com a hora de agora.
function CompleteSignature({ joId, onBack, onDone }: { joId: string; onBack: () => void; onDone: () => void }) {
  const [jo, setJo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sigData, setSigData] = useState<string | null>(null)
  const [signerIsOwner, setSignerIsOwner] = useState(true)
  const [signerName, setSignerName] = useState('')
  const [biNumber, setBiNumber] = useState('')
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    api(`/api/v1/receptions/${joId}`).then(setJo).catch((e: any) => setErr(e?.message || 'Erro'))
      .finally(() => setLoading(false))
  }, [joId])

  const canSign = accepted && !!sigData && (signerIsOwner || signerName.trim().length >= 2)

  const submit = async () => {
    if (!canSign) return
    setBusy(true); setErr(null)
    try {
      await api(`/api/v1/receptions/${joId}/sign`, {
        method: 'POST', body: JSON.stringify({
          signatureBase64: sigData!.split(',')[1],
          signerIsOwner,
          signerName: signerIsOwner ? undefined : (signerName || undefined),
          signerBiNumber: biNumber.trim() || undefined,
        }),
      })
      onDone()
    } catch (e: any) { setErr(e?.message || 'Não foi possível selar a assinatura.') }
    finally { setBusy(false) }
  }

  if (loading) return <main className="reception"><p className="empty">A carregar…</p></main>

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Assinar agora</h2><span />
      </div>

      <div className="remap-warning nonrunner">
        <div className="remap-warning-head"><i className="ti ti-writing-off" aria-hidden="true"></i> Esta entrada ficou por assinar</div>
        <p>A finalização não chegou a selar a assinatura — pode ter falhado a rede ou a aplicação ter sido fechada. As fotos e os dados estão todos registados; falta apenas a assinatura.</p>
        <p><strong>A assinatura é feita agora, de verdade.</strong> Fica registada com a data e hora de hoje, que é o que realmente acontece. A entrada continua a mostrar a data em que o carro deu entrada.</p>
      </div>

      {jo && (
        <div className="sign-summary">
          <div><strong>{jo.number}</strong> · {jo.plate} · {jo.brand} {jo.model}</div>
          <div className="hint">Cliente: {jo.customer_name} · Entrou em {jo.received_at ? new Date(jo.received_at).toLocaleDateString('pt-PT') : '—'}</div>
        </div>
      )}

      <label className="chk-inline" style={{ marginTop: 16 }}>
        <input type="checkbox" checked={!signerIsOwner} onChange={e => setSignerIsOwner(!e.target.checked)} />
        Quem assina não é o dono do carro
      </label>
      {!signerIsOwner && (
        <>
          <label className="fl" style={{ marginTop: 10 }}>Nome de quem assina <span className="req">*</span></label>
          <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Nome e apelido" />
        </>
      )}

      <label className="fl" style={{ marginTop: 14 }}>Nº do documento (opcional)</label>
      <input value={biNumber} onChange={e => setBiNumber(e.target.value)} placeholder="Número do BI / passaporte" />

      <button className={`chk tc ${accepted ? 'on' : ''}`} style={{ marginTop: 16 }} onClick={() => setAccepted(v => !v)}>
        <span className="chk-box">{accepted && <i className="ti ti-check" aria-hidden="true"></i>}</span>
        Confirmo o registo de entrada deste veículo e aceito os termos e condições.
      </button>

      <label className="fl" style={{ marginTop: 14 }}>Assinatura <span className="req">*</span></label>
      <SignaturePad onChange={setSigData} />

      {err && <div className="field-warn" style={{ marginTop: 12 }}>{err}</div>}

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        disabled={!canSign || busy} onClick={submit}>
        {busy ? 'A selar…' : <>Selar assinatura <i className="ti ti-check" aria-hidden="true"></i></>}
      </button>
    </main>
  )
}

// ── LOGS DE ERRO (diagnóstico — só dono) ─────────────────────
function ErrorLogs({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); api('/api/v1/error-logs').then(r => setList(r.data || [])).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  const fmt = (s: string) => new Date(s).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Diagnóstico</h2>
        <button className="btn-ghost btn-sm" onClick={load} title="Actualizar"><i className="ti ti-refresh" aria-hidden="true"></i></button>
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>Erros técnicos recentes do sistema. Útil para diagnóstico. Guardam-se por tempo limitado e não contêm dados de clientes.</p>
      {loading ? <p className="empty">A carregar…</p> : list.length === 0 ? (
        <p className="empty">Sem erros registados. 🎉</p>
      ) : (
        <div className="log-list">
          {list.map(e => (
            <div key={e.id} className="log-row">
              <div className="log-top">
                <span className={`log-status s${Math.floor(e.status_code / 100)}`}>{e.status_code}</span>
                <span className="log-route">{e.method} {e.route}</span>
                <span className="log-time">{fmt(e.created_at)}</span>
              </div>
              <div className="log-msg">{e.message}</div>
              {e.error_code && <div className="log-code">{e.error_code}</div>}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

// ── AUTORIZAÇÕES (cartão do autorizador — ex: Edgar) ─────────
function Authorizations({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api('/api/v1/os/awaiting-authorization').then(r => setList(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  const fmt = (s: string) => s ? new Date(s).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Autorizações</h2><span />
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>Diagnósticos submetidos que aguardam a sua autorização. Ao autorizar, assume a responsabilidade técnica partilhada.</p>
      {loading ? <p className="empty">A carregar…</p> : list.length === 0 ? (
        <p className="empty">Nenhum diagnóstico à espera de si.</p>
      ) : (
        <div className="prob-list">
          {list.map(o => (
            <button key={o.id} className="auth-row" onClick={() => onOpen(o.id)}>
              <div className="auth-main">
                <div className="auth-veh">{o.brand} {o.model} · {o.plate}</div>
                <div className="auth-sub">{o.customer_name} · OS {o.number}</div>
                <div className="auth-meta">Submetido por {o.submitted_by_name}{o.diag_submitted_at ? ` · ${fmt(o.diag_submitted_at)}` : ''}</div>
              </div>
              <i className="ti ti-arrow-right auth-arrow" aria-hidden="true"></i>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

// ── MARCAÇÕES ────────────────────────────────────────────────
const CANCEL_REASONS = [
  'O cliente adiou (sem data definida)',
  'O cliente desistiu do serviço',
  'O preço',
  'O prazo de entrega',
  'Foi a outra oficina',
  'Não conseguimos contacto',
  'O veículo ficou indisponível',
  'Erro de marcação / duplicado',
  'Outro',
]

function Bookings({ onBack, onResume }: { onBack: () => void; onResume: (id: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [reschedId, setReschedId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [newDate, setNewDate] = useState('')

  const load = () => { setLoading(true); api('/api/v1/bookings').then(r => setList(r.data || [])).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])

  const doCancel = async () => {
    if (!cancelId || !cancelReason) return
    try {
      await api(`/api/v1/bookings/${cancelId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: cancelReason, note: cancelNote || undefined }) })
      setCancelId(null); setCancelReason(''); setCancelNote(''); load()
    } catch { alert('Não foi possível cancelar.') }
  }
  const doResched = async () => {
    if (!reschedId || !newDate) return
    try {
      await api(`/api/v1/bookings/${reschedId}/reschedule`, { method: 'POST', body: JSON.stringify({ bookingDate: newDate }) })
      setReschedId(null); setNewDate(''); load()
    } catch { alert('Não foi possível remarcar.') }
  }

  // agrupa: em atraso, hoje, futuras
  const now = new Date()
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999)
  const group = (b: any): 'late' | 'today' | 'future' => {
    const d = new Date(b.booking_date)
    if (d < startToday) return 'late'
    if (d <= endToday) return 'today'
    return 'future'
  }
  const late = list.filter(b => group(b) === 'late')
  const today = list.filter(b => group(b) === 'today')
  const future = list.filter(b => group(b) === 'future')
  const fmt = (s: string) => new Date(s).toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const Card = ({ b, kind }: { b: any; kind: string }) => (
    <div className={`booking-row k-${kind}`}>
      <div className="booking-main">
        <div className="booking-when">{fmt(b.booking_date)}</div>
        <div className="booking-who">{b.customer_name} · {b.plate}</div>
        <div className="booking-veh">{b.brand} {b.model}</div>
      </div>
      <div className="booking-actions">
        <button className="btn-primary btn-sm" onClick={() => onResume(b.id)} title="Continuar entrada quando o carro chega"><i className="ti ti-arrow-right" aria-hidden="true"></i></button>
        <button className="btn-ghost btn-sm" onClick={() => { setReschedId(b.id); setNewDate('') }} title="Remarcar"><i className="ti ti-calendar-plus" aria-hidden="true"></i></button>
        <button className="btn-ghost btn-sm danger" onClick={() => { setCancelId(b.id); setCancelReason('') }} title="Cancelar"><i className="ti ti-x" aria-hidden="true"></i></button>
      </div>
    </div>
  )

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Marcações</h2>
        <span />
      </div>

      {cancelId && (
        <div className="notice-overlay">
          <div className="notice-card" style={{ textAlign: 'left', maxWidth: 420 }}>
            <h2 style={{ textAlign: 'center' }}>Cancelar marcação</h2>
            <label className="fl">Motivo <span className="req">*</span></label>
            <select value={cancelReason} onChange={e => setCancelReason(e.target.value)}>
              <option value="">Escolher…</option>
              {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {(cancelReason === 'Outro' || cancelReason === 'O preço' || cancelReason === 'O prazo de entrega') && (
              <>
                <label className="fl" style={{ marginTop: 10 }}>Detalhe {cancelReason === 'Outro' ? '(obrigatório)' : '(opcional)'}</label>
                <input value={cancelNote} onChange={e => setCancelNote(e.target.value)} placeholder="Nota…" />
              </>
            )}
            <div className="rec-nav">
              <button className="btn-ghost" onClick={() => setCancelId(null)}>Voltar</button>
              <button className="btn-primary" disabled={!cancelReason || (cancelReason === 'Outro' && !cancelNote.trim())} onClick={doCancel}>Cancelar marcação</button>
            </div>
          </div>
        </div>
      )}

      {reschedId && (
        <div className="notice-overlay">
          <div className="notice-card" style={{ maxWidth: 380 }}>
            <h2>Remarcar</h2>
            <label className="fl">Nova data e hora</label>
            <input type="datetime-local" value={newDate} onChange={e => setNewDate(e.target.value)} />
            <div className="rec-nav">
              <button className="btn-ghost" onClick={() => setReschedId(null)}>Voltar</button>
              <button className="btn-primary" disabled={!newDate} onClick={doResched}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <p className="empty">A carregar…</p> : list.length === 0 ? (
        <p className="empty">Sem marcações activas. Cria uma recepção com data de marcação para ela aparecer aqui.</p>
      ) : (
        <>
          {late.length > 0 && (
            <div className="booking-group">
              <div className="booking-group-title late"><i className="ti ti-alert-circle" aria-hidden="true"></i> Em atraso / não compareceram ({late.length})</div>
              {late.map(b => <Card key={b.id} b={b} kind="late" />)}
            </div>
          )}
          {today.length > 0 && (
            <div className="booking-group">
              <div className="booking-group-title today"><i className="ti ti-calendar-due" aria-hidden="true"></i> Hoje ({today.length})</div>
              {today.map(b => <Card key={b.id} b={b} kind="today" />)}
            </div>
          )}
          {future.length > 0 && (
            <div className="booking-group">
              <div className="booking-group-title"><i className="ti ti-calendar" aria-hidden="true"></i> Próximas ({future.length})</div>
              {future.map(b => <Card key={b.id} b={b} kind="future" />)}
            </div>
          )}
        </>
      )}
    </main>
  )
}

// ── AVISOS DENTRO DA APLICAÇÃO ───────────────────────────────
// Os diálogos do navegador (alert/confirm) são uma armadilha em
// telemóvel: depois de alguns, o browser oferece "impedir esta página
// de criar mais diálogos". Se o utilizador aceitar, o alert deixa de
// aparecer E o confirm passa a devolver FALSO em silêncio — a app fica
// muda e os botões deixam de responder, sem explicação nenhuma.
// Por isso: mensagens e confirmações vivem dentro da aplicação.
function Banner({ msg, onClose }: { msg: { kind: 'err' | 'ok'; text: string } | null; onClose: () => void }) {
  if (!msg) return null
  return (
    <div className={`banner ${msg.kind}`} role="status">
      <i className={`ti ${msg.kind === 'err' ? 'ti-alert-circle' : 'ti-circle-check'}`} aria-hidden="true"></i>
      <span>{msg.text}</span>
      <button className="banner-x" onClick={onClose} aria-label="Fechar"><i className="ti ti-x" aria-hidden="true"></i></button>
    </div>
  )
}

function ConfirmBox({ ask, onYes, onNo }: { ask: { text: string; detail?: string; danger?: boolean; yes?: string } | null; onYes: () => void; onNo: () => void }) {
  if (!ask) return null
  return (
    <div className="modal-scrim" onClick={onNo}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{ask.text}</div>
        {ask.detail && <p className="modal-detail">{ask.detail}</p>}
        <div className="rec-nav" style={{ marginTop: 18 }}>
          <button className="btn-ghost" onClick={onNo}>Cancelar</button>
          <button className={ask.danger ? 'btn-ghost danger' : 'btn-primary'} onClick={onYes}>{ask.yes || 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── ORDEM DE SERVIÇO — Fatia 1: Diagnóstico ──────────────────
function OrderService({ joId, onBack, myId, isOwner, onOpenEntry }: { joId: string; onBack: () => void; myId: string; isOwner: boolean; onOpenEntry?: (id: string) => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [newProblem, setNewProblem] = useState('')
  const [notes, setNotes] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [authSig, setAuthSig] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [photoView, setPhotoView] = useState<string | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)
  const load = () => {
    setLoading(true); setLoadError(null)
    api(`/api/v1/os/${joId}`).then(r => {
      if (r.error) { setLoadError(r.error); return }
      setData(r)
      if (r.jo?.diagnosis_notes) setNotes(r.jo.diagnosis_notes)
    }).catch((e: any) => setLoadError(e?.message || 'Erro de ligação')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [joId])

  const startOS = async () => {
    setStarting(true)
    try { await api(`/api/v1/os/start/${joId}`, { method: 'POST' }); load() }
    catch (e: any) { say('err', e?.message || 'Não foi possível iniciar a OS.') }
    finally { setStarting(false) }
  }

  const jo = data?.jo
  const problems = data?.problems || []
  const isDiag = jo?.status === 'in_diagnosis'
  const [acting, setActing] = useState(false)      // trava toques repetidos em 3G
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [ask, setAsk] = useState<{ text: string; detail?: string; danger?: boolean; yes?: string; run: () => void } | null>(null)
  const say = (kind: 'err' | 'ok', text: string) => { setMsg({ kind, text }); if (kind === 'ok') setTimeout(() => setMsg(null), 4000) }
  const isReview = jo?.status === 'diagnosis_review'
  const authOn = data?.diagAuthorizationOn
  const iSubmitted = jo?.diag_submitted_by === myId

  const errorScreen = (msg: string) => (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Ordem de Serviço</h2><span />
      </div>
      <p className="empty">{msg}</p>
      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={load}>
        <i className="ti ti-refresh" aria-hidden="true"></i> Tentar de novo
      </button>
    </main>
  )

  // não iniciada ainda
  if (loading) return <main className="reception"><p className="empty">A carregar…</p></main>
  if (loadError) return errorScreen(`Não foi possível carregar: ${loadError}`)
  if (!jo) return errorScreen('Não foi possível carregar a Ordem de Serviço.')

  if (!jo.os_opened_at) {
    return (
      <main className="reception">
        <div className="rec-top" style={{ marginBottom: 16 }}>
          <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>{jo.number}</h2><span />
        </div>
        <Banner msg={msg} onClose={() => setMsg(null)} />
        <div className="os-start-card">
          <div className="os-start-ic"><i className="ti ti-tools" aria-hidden="true"></i></div>
          <h2>Iniciar Ordem de Serviço</h2>
          <p>Ao iniciar, começa o registo do trabalho neste carro ({jo.brand} {jo.model} · {jo.plate}). As queixas do cliente entram automaticamente na lista de problemas para diagnóstico.</p>
          <button className="btn-primary" style={{ justifyContent: 'center' }} disabled={starting} onClick={startOS}>
            {starting ? 'A iniciar…' : 'Iniciar OS e começar diagnóstico'}
          </button>
        </div>
      </main>
    )
  }

  const addProblem = async () => {
    if (newProblem.trim().length < 2 || acting) return
    setActing(true)
    setMsg(null)
    try { await api(`/api/v1/os/${joId}/problems`, { method: 'POST', body: JSON.stringify({ description: newProblem, origin: 'team' }) }); setNewProblem(''); await load() }
    catch (e: any) { say('err', e?.message || 'Não foi possível adicionar o problema. Verifica a ligação e tenta outra vez.') }
    finally { setActing(false) }
  }
  const updateProblem = async (pid: string, fields: any) => {
    try { await api(`/api/v1/os/problems/${pid}`, { method: 'POST', body: JSON.stringify(fields) }); load() }
    catch (e: any) { say('err', e?.message || 'Não foi possível guardar a alteração.') }
  }
  const deleteProblem = (pid: string) => {
    if (acting) return
    setAsk({
      text: 'Apagar este problema?', danger: true, yes: 'Apagar',
      run: async () => {
        setActing(true)
        try { await api(`/api/v1/os/problems/${pid}`, { method: 'DELETE' }); await load() }
        catch (e: any) { say('err', e?.message || 'Não foi possível apagar.') }
        finally { setActing(false) }
      },
    })
  }
  const addPhoto = async (pid: string) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; (input as any).capture = 'environment'
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return
      const ext = (f.name.split('.').pop() || 'jpg')
      try {
        const r = await api(`/api/v1/os/problems/${pid}/photo-url`, { method: 'POST', body: JSON.stringify({ ext }) })
        await fetch(r.uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } })
        load()
      } catch (e: any) { say('err', e?.message || 'Não foi possível anexar a foto.') }
    }
    input.click()
  }
  // Porta de sentido único: tranca a lista de problemas e passa a depender
  // de outra pessoa. Não pode ir a um toque distraído — daí a confirmação.
  const submitDiagnosis = () => {
    if (acting) return
    setAsk({
      text: `Submeter o diagnóstico de ${problems.length} problema${problems.length > 1 ? 's' : ''}?`,
      detail: authOn
        ? 'A lista fica trancada à espera de autorização. Se te enganares, podes retirar a submissão enquanto ninguém a autorizar.'
        : 'O diagnóstico fica concluído e a OS segue para orçamento.',
      yes: 'Submeter',
      run: async () => {
        setActing(true); setMsg(null)
        try {
          const r = await api(`/api/v1/os/${joId}/submit-diagnosis`, { method: 'POST', body: JSON.stringify({ notes: notes || undefined }) })
          say('ok', r.status === 'diagnosis_review' ? 'Diagnóstico submetido para autorização.' : 'Diagnóstico concluído. OS pronta para orçamento.')
          await load()
        } catch (e: any) { say('err', e?.message || 'Não foi possível submeter. Verifica a ligação e tenta outra vez.') }
        finally { setActing(false) }
      },
    })
  }

  // Retirar a submissão — a saída para quem submeteu por engano.
  const withdrawDiagnosis = () => {
    if (acting) return
    setAsk({
      text: 'Retirar a submissão?',
      detail: 'O diagnóstico volta a ficar editável para corrigires. Depois submetes outra vez.',
      yes: 'Retirar',
      run: async () => {
        setActing(true)
        try { await api(`/api/v1/os/${joId}/withdraw-diagnosis`, { method: 'POST' }); await load(); say('ok', 'Submissão retirada. Podes corrigir e submeter outra vez.') }
        catch (e: any) { say('err', e?.message || 'Não foi possível retirar.') }
        finally { setActing(false) }
      },
    })
  }
  const authorize = async () => {
    if (!authSig) return
    try { await api(`/api/v1/os/${joId}/authorize-diagnosis`, { method: 'POST', body: JSON.stringify({ approve: true, signature: authSig }) }); setShowAuth(false); load(); say('ok', 'Diagnóstico autorizado.') }
    catch (e: any) { say('err', e?.message || 'Não foi possível autorizar.') }
  }
  const reject = async () => {
    if (!rejectNote.trim()) return
    try { await api(`/api/v1/os/${joId}/authorize-diagnosis`, { method: 'POST', body: JSON.stringify({ approve: false, note: rejectNote }) }); setRejecting(false); setRejectNote(''); load(); say('ok', 'Diagnóstico recusado e devolvido.') }
    catch (e: any) { say('err', e?.message || 'Não foi possível recusar.') }
  }

  return (
    <main className="reception">
      {photoView && (
        <div className="photo-viewer" onClick={() => setPhotoView(null)}>
          <img src={photoView} alt="evidência" />
          <button className="photo-viewer-close"><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
      )}

      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>OS {jo.number}</h2><span />
      </div>
      {onOpenEntry && (
        <button className="det-link" style={{ marginBottom: 12 }} onClick={() => onOpenEntry(joId)}>
          <i className="ti ti-file-description" aria-hidden="true"></i>
          <span>Ver o que foi registado à entrada</span>
          <i className="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
      )}
      <Banner msg={msg} onClose={() => setMsg(null)} />
      <ConfirmBox ask={ask} onNo={() => setAsk(null)} onYes={() => { const r = ask?.run; setAsk(null); r?.() }} />

      <div className="os-status-bar">
        <span className="os-veh">{jo.brand} {jo.model} · {jo.plate}</span>
        <span className={`os-badge st-${jo.status}`}>
          {jo.status === 'in_diagnosis' ? 'Em diagnóstico' : jo.status === 'diagnosis_review' ? 'Aguarda autorização' : jo.status === 'awaiting_quote' ? 'Diagnóstico concluído' : jo.status}
        </span>
      </div>

      {jo.diag_rejected_note && isDiag && (
        <div className="os-reject-note"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Diagnóstico devolvido: {jo.diag_rejected_note}</div>
      )}

      <div className="det-section-title" style={{ marginTop: 18 }}>Lista de problemas</div>
      <div className="prob-list">
        {problems.map((p: any) => (
          <div key={p.id} className="prob-card">
            <div className="prob-head">
              <span className={`prob-origin o-${p.origin}`}>{p.origin === 'customer' ? 'Cliente' : 'Equipa'}</span>
              <span className="prob-desc">{p.description}</span>
              {isDiag && <button className="prob-x" onClick={() => deleteProblem(p.id)}><i className="ti ti-x" aria-hidden="true"></i></button>}
            </div>
            {isDiag ? (
              <textarea className="prob-diag" placeholder="Diagnóstico: o que se concluiu…" defaultValue={p.diagnosis || ''}
                onBlur={e => { if (e.target.value !== (p.diagnosis || '')) updateProblem(p.id, { diagnosis: e.target.value }) }} rows={2} />
            ) : p.diagnosis ? <div className="prob-diag-view">{p.diagnosis}</div> : <div className="prob-diag-empty">Sem diagnóstico registado</div>}
            <div className="prob-photos">
              {(p.photos || []).map((ph: any) => ph.url && (
                <div key={ph.id} className="prob-photo" onClick={() => setPhotoView(ph.url)}><img src={ph.url} alt="evidência" /></div>
              ))}
              {isDiag && <button className="prob-add-photo" onClick={() => addPhoto(p.id)}><i className="ti ti-camera" aria-hidden="true"></i></button>}
            </div>
          </div>
        ))}
        {problems.length === 0 && <p className="empty">Sem problemas na lista.</p>}
      </div>

      {isDiag && (
        <>
          <div className="prob-add">
            <input value={newProblem} onChange={e => setNewProblem(e.target.value)} placeholder="Acrescentar problema detectado pela equipa…"
              disabled={acting}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProblem() } }} />
            <button className="btn-primary" onClick={addProblem} disabled={acting || newProblem.trim().length < 2}>
              {acting ? <i className="ti ti-loader-2 spin" aria-hidden="true"></i> : <i className="ti ti-plus" aria-hidden="true"></i>}
            </button>
          </div>
          <label className="fl" style={{ marginTop: 16 }}>Notas gerais do diagnóstico (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observações gerais…" />
          <button className="btn-primary submit-diag" onClick={submitDiagnosis} disabled={acting || problems.length === 0}>
            {acting ? 'A submeter…' : authOn ? 'Submeter diagnóstico para autorização' : 'Concluir diagnóstico'}
          </button>
        </>
      )}

      {isReview && (
        <div className="os-review-box">
          <div className="os-review-head"><i className="ti ti-clipboard-check" aria-hidden="true"></i> Diagnóstico aguarda autorização</div>
          <p className="det-notes">Submetido por {jo.diag_submitted_by_name}. {authOn && 'A autorização assume a responsabilidade técnica partilhada pelo diagnóstico.'}</p>
          {iSubmitted ? (
            <>
              <p className="det-empty">Não podes autorizar o teu próprio diagnóstico. Aguarda a autorização do responsável.</p>
              <p className="det-notes" style={{ marginTop: 8 }}>Enganaste-te ou falta corrigir alguma coisa? Podes retirar a submissão enquanto ninguém a autorizar.</p>
              <button className="btn-ghost" style={{ marginTop: 8 }} onClick={withdrawDiagnosis} disabled={acting}>
                <i className="ti ti-arrow-back-up" aria-hidden="true"></i> {acting ? 'A retirar…' : 'Retirar submissão'}
              </button>
            </>
          ) : !showAuth && !rejecting ? (
            <div className="rec-nav">
              <button className="btn-ghost danger" onClick={() => setRejecting(true)}>Recusar</button>
              <button className="btn-primary" onClick={() => setShowAuth(true)}>Autorizar</button>
            </div>
          ) : rejecting ? (
            <div style={{ marginTop: 12 }}>
              <label className="fl">Motivo da recusa <span className="req">*</span></label>
              <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="ex: faltou verificar o turbo" />
              <div className="rec-nav">
                <button className="btn-ghost" onClick={() => setRejecting(false)}>Voltar</button>
                <button className="btn-primary" disabled={!rejectNote.trim()} onClick={reject}>Devolver ao diagnóstico</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="os-auth-notice">
                Ao assinar, assumo a responsabilidade técnica partilhada por este diagnóstico, nos termos das minhas funções.
              </div>
              <label className="fl" style={{ marginTop: 10 }}>Assinatura <span className="req">*</span></label>
              <SignaturePad onChange={setAuthSig} />
              <div className="rec-nav">
                <button className="btn-ghost" onClick={() => setShowAuth(false)}>Voltar</button>
                <button className="btn-primary" disabled={!authSig} onClick={authorize}>Autorizar diagnóstico</button>
              </div>
            </div>
          )}
        </div>
      )}

      {jo.status === 'awaiting_quote' && (
        <div className="os-done-box">
          <i className="ti ti-circle-check-filled" aria-hidden="true"></i>
          <div>
            <strong>Diagnóstico concluído.</strong>
            <p>{jo.diag_authorized_by_name ? `Autorizado por ${jo.diag_authorized_by_name}.` : ''} A OS está pronta para a fase de orçamento (próxima fatia).</p>
          </div>
        </div>
      )}

      {isOwner && jo.status !== 'delivered' && (
        <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
          onClick={async () => {
            if (!confirm(`Marcar ${jo.number} como finalizada/entregue?\n\nAtalho temporário para fechar carros já tratados enquanto o ciclo completo não está pronto.`)) return
            try { await api(`/api/v1/receptions/${joId}/status`, { method: 'POST', body: JSON.stringify({ status: 'delivered' }) }); load() }
            catch { alert('Não foi possível finalizar.') }
          }}>
          <i className="ti ti-checkbox" aria-hidden="true"></i> Marcar como finalizada
        </button>
      )}

      {jo.status === 'delivered' && (
        <div className="os-done-box"><i className="ti ti-flag-check" aria-hidden="true"></i><div><strong>Finalizada / entregue.</strong></div></div>
      )}
    </main>
  )
}

// ── TAREFAS (to-do list hierárquica) ─────────────────────────
function Tasks({ onBack, isOwner, myId }: { onBack: () => void; isOwner: boolean; myId: string }) {
  const [mine, setMine] = useState<any[]>([])
  const [assigned, setAssigned] = useState<any[]>([])
  const [assignable, setAssignable] = useState<any[]>([])
  const [tab, setTab] = useState<'mine' | 'assigned'>('mine')
  const [showNew, setShowNew] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [report, setReport] = useState<any>(null)

  // formulário nova tarefa
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<'normal' | 'high'>('normal')
  const [weight, setWeight] = useState<'normal' | 'important' | 'critical'>('normal')
  const [recurrence, setRecurrence] = useState('')
  const [reqConfirm, setReqConfirm] = useState(false)
  const [reqAttach, setReqAttach] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => {
    api('/api/v1/tasks').then(r => { setMine(r.mine); setAssigned(r.assigned) }).catch(() => {})
    api('/api/v1/tasks/assignable').then(r => setAssignable(r.data)).catch(() => {})
  }
  useEffect(() => {
    load()
    api('/api/v1/tasks/perf-notice').then(r => { if (!r.seen) setShowNotice(true) }).catch(() => {})
  }, [])

  const openReport = async () => {
    try { const r = await api('/api/v1/tasks/weekly-report'); setReport(r); setShowReport(true) } catch { alert('Não foi possível carregar o relatório.') }
  }

  const [editId, setEditId] = useState<string | null>(null)   // tarefa a editar (null = criar)

  // Abre o formulário já preenchido com a tarefa a editar.
  const startEdit = (t: any) => {
    setEditId(t.id)
    setTitle(t.title || ''); setDesc(t.description || '')
    setAssignTo(t.assigned_to || ''); setDue(t.due_date ? String(t.due_date).slice(0, 10) : '')
    setPriority(t.priority || 'normal'); setWeight(t.weight || 'normal')
    setRecurrence(t.recurrence || ''); setReqConfirm(!!t.requires_confirmation)
    setReqAttach(!!t.requires_attachment)
    setShowNew(true)
  }

  const closeForm = () => {
    setEditId(null); setShowNew(false)
    setTitle(''); setDesc(''); setAssignTo(''); setDue(''); setPriority('normal')
    setWeight('normal'); setRecurrence(''); setReqConfirm(false); setReqAttach(false)
  }

  const dismissNotice = async () => {
    setShowNotice(false)
    try { await api('/api/v1/tasks/perf-notice/seen', { method: 'POST' }) } catch {}
  }

  const create = async () => {
    if (title.trim().length < 2 || !assignTo) return
    setBusy(true)
    try {
      const payload = {
        title, description: desc || undefined, assignedTo: assignTo,
        dueDate: due || undefined, priority,
        weight: isOwner ? weight : undefined,
        isPersonal: assignTo === myId,
        requiresConfirmation: reqConfirm || undefined,
        requiresAttachment: reqAttach || undefined,
        recurrence: recurrence || undefined,
      }
      if (editId) await api(`/api/v1/tasks/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      else await api('/api/v1/tasks', { method: 'POST', body: JSON.stringify(payload) })
      closeForm()
      load()
    } catch (e: any) { alert(e?.message || (editId ? 'Não foi possível guardar.' : 'Não foi possível criar a tarefa.')) }
    finally { setBusy(false) }
  }

  const setStatus = async (t: any, status: string) => {
    // Se a tarefa exige anexo e vai ser concluída, pede o ficheiro primeiro
    if (status === 'done' && t.requires_attachment && !t.attachment_path) {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = 'image/*,application/pdf'
      input.onchange = async () => {
        const f = input.files?.[0]; if (!f) return
        const ext = f.name.split('.').pop() || 'jpg'
        try {
          const r = await api(`/api/v1/tasks/${t.id}/attachment-url`, { method: 'POST', body: JSON.stringify({ ext }) })
          await fetch(r.uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } })
          await api(`/api/v1/tasks/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'done' }) })
          load()
        } catch { alert('Não foi possível anexar o ficheiro.') }
      }
      input.click()
      return
    }
    try {
      await api(`/api/v1/tasks/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
      load()
    } catch (e: any) { alert(e?.message || 'Não foi possível actualizar.') }
  }
  const removeTask = async (t: any) => {
    if (!confirm(`Apagar a tarefa "${t.title}"?`)) return
    try { await api(`/api/v1/tasks/${t.id}`, { method: 'DELETE' }); load() } catch { alert('Não foi possível apagar.') }
  }

  // classificação de urgência para as MINHAS tarefas
  const urgency = (t: any): 'overdue' | 'soon' | 'none' => {
    if (t.status === 'done' || !t.due_date) return 'none'
    const now = Date.now(), d = new Date(t.due_date).getTime()
    if (d < now) return 'overdue'
    if (d - now < 48 * 3600 * 1000) return 'soon'
    return 'none'
  }
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  // ordena: atrasadas primeiro, depois a expirar, depois normais, feitas no fim
  const sortedMine = [...mine].sort((a, b) => {
    const rank = (t: any) => t.status === 'done' ? 3 : urgency(t) === 'overdue' ? 0 : urgency(t) === 'soon' ? 1 : 2
    return rank(a) - rank(b)
  })

  const list = tab === 'mine' ? sortedMine : assigned
  const STATUS_NEXT: Record<string, { label: string; to: string; icon: string }> = {
    pending: { label: 'Começar', to: 'in_progress', icon: 'ti-player-play' },
    in_progress: { label: 'Concluir', to: 'done', icon: 'ti-check' },
  }

  return (
    <main className="reception">
      {showNotice && (
        <div className="notice-overlay">
          <div className="notice-card">
            <div className="notice-ic"><i className="ti ti-target-arrow" aria-hidden="true"></i></div>
            <h2>As tuas tarefas contam</h2>
            <p>Aqui vês o que te foi atribuído e os prazos. O teu desempenho — tarefas concluídas e prazos cumpridos — é acompanhado e faz parte da tua avaliação.</p>
            <p>É também a base para reconhecer o bom trabalho, em progressões e bónus. Contamos contigo.</p>
            <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={dismissNotice}>Entendi</button>
          </div>
        </div>
      )}

      {showReport && report && (
        <div className="notice-overlay" onClick={() => setShowReport(false)}>
          <div className="notice-card" style={{ textAlign: 'left', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center' }}>Relatório semanal</h2>
            <div className="report-sec">
              <div className="report-sec-title">Concluídas ({report.completed.length})</div>
              {report.completed.length === 0 ? <p className="det-empty">Nenhuma.</p> : report.completed.map((r: any, i: number) => (
                <div key={i} className="report-item"><span>{r.title} · {r.who}</span>{r.was_on_time === false && <span className="task-late">fora do prazo</span>}</div>
              ))}
            </div>
            <div className="report-sec">
              <div className="report-sec-title warn">Aguardam a tua confirmação ({report.awaiting.length})</div>
              {report.awaiting.length === 0 ? <p className="det-empty">Nenhuma.</p> : report.awaiting.map((r: any, i: number) => (
                <div key={i} className="report-item"><span>{r.title} · {r.who}</span></div>
              ))}
            </div>
            <div className="report-sec">
              <div className="report-sec-title danger">Atrasadas ({report.late.length})</div>
              {report.late.length === 0 ? <p className="det-empty">Nenhuma.</p> : report.late.map((r: any, i: number) => (
                <div key={i} className="report-item"><span>{r.title} · {r.who}</span></div>
              ))}
            </div>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setShowReport(false)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Tarefas</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {isOwner && <button className="btn-ghost btn-sm" onClick={openReport} title="Relatório semanal"><i className="ti ti-report" aria-hidden="true"></i></button>}
          <button className="btn-primary btn-sm" onClick={() => { setEditId(null); setShowNew(true) }}><i className="ti ti-plus" aria-hidden="true"></i> Nova</button>
        </div>
      </div>

      <div className="task-tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>As minhas ({mine.filter(t => t.status !== 'done').length})</button>
        {(assignable.length > 0 || assigned.length > 0) && <button className={tab === 'assigned' ? 'on' : ''} onClick={() => setTab('assigned')}>Que atribuí ({assigned.filter(t => t.status !== 'done').length})</button>}
      </div>

      {showNew && (
        <div className="task-form">
          {editId && <div className="form-mode"><i className="ti ti-pencil" aria-hidden="true"></i> A editar uma tarefa existente</div>}
          <label className="fl">Tarefa <span className="req">*</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="O que precisa de ser feito" />
          <label className="fl" style={{ marginTop: 12 }}>Detalhes (opcional)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Notas ou contexto" />
          <label className="fl" style={{ marginTop: 12 }}>Responsável <span className="req">*</span></label>
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)}>
            <option value="">Escolher…</option>
            <option value={myId}>Para mim (lembrete pessoal)</option>
            {assignable.map(u => <option key={u.id} value={u.id}>{u.full_name} — {u.role_name}</option>)}
          </select>
          <label className="fl" style={{ marginTop: 12 }}>Prazo (opcional)</label>
          <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} />
          <label className="fl" style={{ marginTop: 12 }}>Repetição</label>
          <div className="seg">
            {[['', 'Única'], ['daily', 'Diária'], ['weekly', 'Semanal'], ['monthly', 'Mensal']].map(([v, l]) => (
              <button key={v} className={recurrence === v ? 'on' : ''} onClick={() => setRecurrence(v)}>{l}</button>
            ))}
          </div>
          {isOwner && (
            <>
              <label className="fl" style={{ marginTop: 12 }}>Peso (avaliação)</label>
              <div className="seg">
                {[['normal', 'Normal'], ['important', 'Importante'], ['critical', 'Crítica']].map(([v, l]) => (
                  <button key={v} className={weight === v ? 'on' : ''} onClick={() => setWeight(v as any)}>{l}</button>
                ))}
              </div>
            </>
          )}
          {assignTo !== myId && (
            <label className="chk-inline" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={reqConfirm} onChange={e => setReqConfirm(e.target.checked)} />
              Exige a minha confirmação quando concluída
            </label>
          )}
          <label className="chk-inline">
            <input type="checkbox" checked={reqAttach} onChange={e => setReqAttach(e.target.checked)} />
            Exige anexo (foto ou PDF) para concluir
          </label>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={closeForm}>Cancelar</button>
            <button className="btn-primary" disabled={busy || title.trim().length < 2 || !assignTo} onClick={create}>
              {busy ? 'A guardar…' : editId ? 'Guardar alterações' : 'Criar tarefa'}
            </button>
          </div>
        </div>
      )}

      <div className="list" style={{ marginTop: 14 }}>
        {list.map(t => {
          const u = tab === 'mine' ? urgency(t) : 'none'
          return (
            <div key={t.id} className={`task-row ${t.status === 'done' ? 'done' : ''} u-${u}`}>
              <div className="task-main">
                <div className="task-title">
                  {t.priority === 'high' && t.status !== 'done' && <i className="ti ti-flag-filled task-flag" aria-hidden="true"></i>}
                  {t.title}
                  {t.weight === 'critical' && <span className="wbadge crit">Crítica</span>}
                  {t.weight === 'important' && <span className="wbadge imp">Importante</span>}
                  {t.is_personal && <span className="wbadge pers">Pessoal</span>}
                </div>
                {t.description && <div className="task-desc">{t.description}</div>}
                <div className="task-meta">
                  {tab === 'mine'
                    ? <>de {t.assigned_by_name}</>
                    : <>para {t.assigned_to_name}</>}
                  {t.jo_number && <> · <span className="task-jo"><i className="ti ti-car" aria-hidden="true"></i> {t.jo_plate || t.jo_number}</span></>}
                  {t.recurrence && <> · <span className="task-rec"><i className="ti ti-repeat" aria-hidden="true"></i> {t.recurrence === 'daily' ? 'diária' : t.recurrence === 'weekly' ? 'semanal' : 'mensal'}</span></>}
                  {t.due_date && <> · <span className={`task-due u-${u}`}>{u === 'overdue' ? 'Atrasada · ' : u === 'soon' ? 'A expirar · ' : ''}{fmtDate(t.due_date)}</span></>}
                  {t.status === 'awaiting_confirmation' && <> · <span className="task-await">aguarda confirmação</span></>}
                  {t.status === 'done' && t.was_on_time === false && <> · <span className="task-late">concluída fora do prazo</span></>}
                  {t.requires_attachment && t.status !== 'done' && <> · <span className="task-att"><i className="ti ti-paperclip" aria-hidden="true"></i> exige anexo</span></>}
                </div>
              </div>
              <div className="task-actions">
                {tab === 'mine' && t.status !== 'done' && t.status !== 'awaiting_confirmation' && STATUS_NEXT[t.status] && (
                  <button className="btn-primary btn-sm" onClick={() => setStatus(t, STATUS_NEXT[t.status].to)}>
                    <i className={`ti ${STATUS_NEXT[t.status].icon}`} aria-hidden="true"></i> {STATUS_NEXT[t.status].label}
                  </button>
                )}
                {tab === 'assigned' && t.status === 'awaiting_confirmation' && (
                  <button className="btn-primary btn-sm" onClick={async () => { try { await api(`/api/v1/tasks/${t.id}/confirm`, { method: 'POST' }); load() } catch { alert('Erro.') } }}>
                    <i className="ti ti-check" aria-hidden="true"></i> Confirmar
                  </button>
                )}
                {t.status === 'done' && <span className="task-check"><i className="ti ti-circle-check-filled" aria-hidden="true"></i></span>}
                {t.status !== 'done' && (isOwner || t.assigned_by === myId) && (
                  <button className="btn-ghost btn-sm" onClick={() => startEdit(t)} title="Editar tarefa">
                    <i className="ti ti-pencil" aria-hidden="true"></i>
                  </button>
                )}
                {tab === 'assigned' && t.status !== 'awaiting_confirmation' && (
                  <button className="btn-ghost btn-sm danger" onClick={() => removeTask(t)} title="Apagar"><i className="ti ti-trash" aria-hidden="true"></i></button>
                )}
              </div>
            </div>
          )
        })}
        {list.length === 0 && <p className="empty">{tab === 'mine' ? 'Não tens tarefas atribuídas.' : 'Ainda não atribuíste tarefas.'}</p>}
      </div>
    </main>
  )
}

// ── Bootstrap ────────────────────────────────────────────────
function App() {
  const token = useSession(s => s.accessToken)
  const checkTimeout = useSession(s => s.checkTimeout)
  const touch = useSession(s => s.touch)

  useEffect(() => {
    checkTimeout()   // ao abrir a app
    const iv = setInterval(() => checkTimeout(), 60 * 1000)   // verifica a cada minuto
    const onActivity = () => touch()
    const events = ['click', 'keydown', 'touchstart', 'visibilitychange']
    events.forEach(e => window.addEventListener(e, onActivity))
    return () => { clearInterval(iv); events.forEach(e => window.removeEventListener(e, onActivity)) }
  }, [])

  return token ? <Shell /> : <Login />
}
createRoot(document.getElementById('root')!).render(<App />)
