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
  const lockedByTimeout = useSession(s => s.lockedByTimeout)
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
          {lockedByTimeout && !err && <div className="info-lock"><i className="ti ti-lock" aria-hidden="true"></i> A sessão foi bloqueada por inatividade. Entra outra vez para continuar.</div>}
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
  const [novidades, setNovidades] = useState<any[] | null>(null)
  const [novPrimeira, setNovPrimeira] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [temUpdate, setTemUpdate] = useState(false)   // há versão nova à espera
  const [view, setView] = useState<'home' | 'reception' | 'list' | 'tasks' | 'detail' | 'bookings' | 'os' | 'authorizations' | 'errorlogs' | 'sign' | 'password' | 'complete' | 'queue' | 'servicetypes' | 'ppi' | 'ppi-list' | 'updates' | 'ppi-model' | 'suppliers' | 'qcqueue' | 'admin' | 'quickbooking' | 'leads'>('home')
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [osId, setOsId] = useState<string | undefined>(undefined)
  const [ppiJoId, setPpiJoId] = useState<string | null>(null)
  const [ppiReturnTo, setPpiReturnTo] = useState<'list' | 'ppi-list'>('list')
  const [osReturnTo, setOsReturnTo] = useState<'list' | 'authorizations' | 'detail' | 'qcqueue'>('list')
  const [signId, setSignId] = useState<string | undefined>(undefined)
  const [completeId, setCompleteId] = useState<string | undefined>(undefined)
  const [bookingCount, setBookingCount] = useState(0)
  const [leadCount, setLeadCount] = useState(0)
  const [authCount, setAuthCount] = useState(0)
  const [qcCount, setQcCount] = useState(0)
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
  // Novidades por ver desde a última visita → popup.
  useEffect(() => {
    api('/api/v1/updates/unseen')
      .then(r => { if ((r.updates || []).length) { setNovidades(r.updates); setNovPrimeira(!!r.primeiraVez) } })
      .catch(e => { console.warn('Não foi possível carregar as novidades:', e?.message || e) })
  }, [])

  useEffect(() => {
    if (view === 'home') {
      api('/api/v1/bookings/leads/count').then(r => setLeadCount(r.count || 0)).catch(() => {})
      api('/api/v1/bookings').then(r => {
        const now = new Date(); now.setHours(23, 59, 59, 999)
        const relevant = (r.data || []).filter((b: any) => new Date(b.booking_date) <= now)
        setBookingCount(relevant.length)
      }).catch(() => {})
      api('/api/v1/os/awaiting-authorization').then(r => setAuthCount((r.data || []).length)).catch(() => {})
      api('/api/v1/os/awaiting-qc').then(r => setQcCount((r.data || []).length)).catch(() => {})
      api('/api/v1/dashboard/summary').then(setSummary).catch(() => {})
    }
  }, [view])

  const nav = (v: string, label: string, icon: string, count?: number, badge = false) => ({
    v, label, icon, count, badge,
  })
  const navItems = [
    nav('home', 'Painel', 'ti-layout-dashboard'),
    canDo('reception:create') && nav('reception', 'Nova recepção', 'ti-plus'),
    canDo('reception:create') && nav('quickbooking', 'Marcação rápida', 'ti-bolt'),
    canDo('reception:read') && nav('leads', 'Marcações a tratar', 'ti-inbox', leadCount || undefined, leadCount > 0),
    canDo('reception:read') && nav('list', 'Recepções', 'ti-list-details', summary?.inShop),
    canDo('reception:read') && nav('ppi-list', 'Inspeções PPI', 'ti-clipboard-list'),
    authCount > 0 && nav('authorizations', 'Autorizações', 'ti-clipboard-check', authCount, true),
    qcCount > 0 && nav('qcqueue', 'Controlo de qualidade', 'ti-shield', qcCount, true),
    canDo('reception:create') && nav('bookings', 'Marcações', 'ti-calendar-event', bookingCount || undefined, bookingCount > 0),
    nav('tasks', 'Tarefas', 'ti-checklist'),
    canDo('config:manage') && nav('servicetypes', 'Tipos de serviço', 'ti-tool'),
    user?.platformAdmin && nav('admin', 'Oficinas (admin)', 'ti-building-store'),
    canDo('config:manage') && nav('ppi-model', 'Modelo de inspeção', 'ti-adjustments'),
    canDo('config:manage') && nav('suppliers', 'Fornecedores', 'ti-building-store'),
    nav('updates', 'Novidades', 'ti-bell'),
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
      {view === 'reception' && <Reception key={resumeDraftId || 'new'} resumeDraftId={resumeDraftId} onDone={() => { setResumeDraftId(undefined); setView('list') }} onBack={() => { setResumeDraftId(undefined); setView('home') }} onStartPPI={(joId: string) => { setResumeDraftId(undefined); setPpiJoId(joId); setPpiReturnTo('list'); setView('ppi') }} />}
      {view === 'ppi' && ppiJoId && <PPICircuit joId={ppiJoId} onBack={() => setView(ppiReturnTo)} />}
      {novidades && novidades.length > 0 && (
        <UpdatesPopup updates={novidades} primeiraVez={novPrimeira}
          onClose={() => { setNovidades(null); api('/api/v1/updates/seen', { method: 'POST' }).catch(() => {}) }} />
      )}
      {view === 'updates' && <UpdatesPage onBack={() => setView('home')} />}
      {view === 'ppi-model' && <PPIModel onBack={() => setView('home')} />}
      {view === 'suppliers' && <SuppliersPage onBack={() => setView('home')} />}
      {view === 'qcqueue' && <QCQueue onBack={() => setView('home')} onOpen={(id) => { setOsId(id); setOsReturnTo('qcqueue'); setView('os') }} />}
      {view === 'admin' && <AdminWorkshops onBack={() => setView('home')} />}
      {view === 'quickbooking' && <QuickBooking onBack={() => setView('home')} onDone={() => setView('leads')} />}
      {view === 'leads' && <LeadsList onBack={() => setView('home')} onOpen={(id) => { setResumeDraftId(id); setView('reception') }} />}
      {view === 'ppi-list' && <PPIList onBack={() => setView('home')} onOpen={(joId: string) => { setPpiJoId(joId); setPpiReturnTo('ppi-list'); setView('ppi') }} />}
      {view === 'list' && <ReceptionList onBack={() => setView('home')} onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} onOpen={(id: string) => { setDetailId(id); setView('detail') }} isOwner={isOwner} onOpenOS={(id: string) => { setOsId(id); setOsReturnTo('list'); setView('os') }}
        onOpenPPI={(id: string) => { setPpiJoId(id); setPpiReturnTo('list'); setView('ppi') }}
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
  'Pneu suplente + macaco','Rádio com código','Tapetes originais','Resguardo do motor (plástico)']

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


function Reception({ onDone, onBack, resumeDraftId, onStartPPI }: { onDone: () => void; onBack: () => void; resumeDraftId?: string; onStartPPI?: (joId: string) => void }) {
  const tenant = useSession(s => s.tenant)
  const [step, setStep] = useState(0)
  // O modo de entrada decide-se DEPOIS dos serviços (não à partida):
  //  - se algum serviço escolhido não permite rápida → obrigatoriamente completa
  //  - se todos permitem → o Yury escolhe (rápida ou completa, o lado seguro)
  // 'quick' é o modo efectivo; null = ainda não decidido.
  const [entryMode, setEntryMode] = useState<'quick' | 'full' | null>(null)
  const quick = entryMode === 'quick'
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
  const [accompSug, setAccompSug] = useState<Record<string, any[]>>({})   // typeId -> acompanhamentos sugeridos
  const [accompOn, setAccompOn] = useState<Record<string, boolean>>({})   // "typeId:label" -> aceite?
  // Rápida só é possível se TODOS os serviços a permitirem. Basta um
  // que não permita para o carro ir obrigatoriamente por completa.
  const podeRapida = chosenServices.length > 0 && chosenServices.every(x => x.allowsQuickEntry)
  const obrigaCompleta = chosenServices.length > 0 && chosenServices.some(x => !x.allowsQuickEntry)
  // Se os serviços obrigam a completa, fixa o modo em 'full'. Se a escolha
  // deixa de fazer sentido (sem serviços), limpa para reescolher.
  useEffect(() => {
    if (obrigaCompleta && entryMode !== 'full') setEntryMode('full')
    if (chosenServices.length === 0 && entryMode) setEntryMode(null)
  }, [obrigaCompleta, chosenServices.length])
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
  const [result, setResult] = useState<{ number: string; offline: boolean; joId?: string; draft?: boolean; hasPpi?: boolean } | null>(null)

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
      if (d.entry_type === 'quick' || d.entry_type === 'full') setEntryMode(d.entry_type)
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
      services: expandirServicos(), serviceDescription: svcDesc || undefined,
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
      setResult({ number: r.number, offline: false, draft: true })
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
    // Ao escolher (não PPI), buscar os acompanhamentos sugeridos.
    if (!ehPPI && !accompSug[t.id]) {
      api(`/api/v1/service-types/${t.id}/accompaniments`)
        .then(r => {
          const items = r.data || []
          if (items.length) {
            setAccompSug(s => ({ ...s, [t.id]: items }))
            // por defeito, vêm marcados os que auto_suggest
            setAccompOn(o => { const n = { ...o }; items.forEach((it: any) => { if (it.auto_suggest) n[`${t.id}:${it.label}`] = true }); return n })
          }
        }).catch(() => {})
    }
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
      if (ehPPI) novo = [{ serviceTypeId: t.id, typeName: t.name, clientPresence: t.client_presence, allowsQuickEntry: t.allows_quick_entry }]
      else if (jaTemPPI) novo = [{ serviceTypeId: t.id, typeName: t.name, clientPresence: t.client_presence, allowsQuickEntry: t.allows_quick_entry }]
      else novo = [...cur, { serviceTypeId: t.id, typeName: t.name, clientPresence: t.client_presence, allowsQuickEntry: t.allows_quick_entry }]
      if (!presenceTouched) setPresence(novo.some(x => x.clientPresence === 'leaves') ? 'leaves' : novo.length ? 'waits' : null)
      return novo
    })
  }

  // Expande os serviços escolhidos com os acompanhamentos aceites:
  // os do tipo "serviço" viram serviços próprios; materiais e
  // consumíveis aceites vão como nota no serviço-mãe (entram no
  // orçamento na Fase 5).
  const expandirServicos = () => {
    const base = chosenServices.map(({ serviceTypeId, typeName, notes }) => ({ serviceTypeId, typeName, notes }))
    const extraServicos: any[] = []
    for (const cs of chosenServices) {
      const sug = accompSug[cs.serviceTypeId] || []
      const matNotes: string[] = []
      for (const it of sug) {
        if (!accompOn[`${cs.serviceTypeId}:${it.label}`]) continue
        if (it.kind === 'service') extraServicos.push({ serviceTypeId: null, typeName: it.label, notes: `(de ${cs.typeName})` })
        else matNotes.push(it.label + (it.default_qty ? ` ${it.default_qty}${it.unit ? it.unit : ''}` : ''))
      }
      if (matNotes.length) {
        const alvo = base.find(b => b.typeName === cs.typeName)
        if (alvo) alvo.notes = [alvo.notes, 'Inclui: ' + matNotes.join(', ')].filter(Boolean).join(' · ')
      }
    }
    return [...base, ...extraServicos]
  }

  const removeIntention = (v: string) => setIntentions(xs => xs.filter(x => x !== v))
  const addIntention = (v: string) => {
    const t = v.trim()
    if (t && !intentions.includes(t)) setIntentions(xs => [...xs, t])
    setIntentInput('')
  }

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
      case 2: return chosenServices.length >= 1 && !!presence && entryMode !== null && (quick ? V.km(km) : intentions.length >= 1)
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
      services: expandirServicos(), serviceDescription: svcDesc || undefined,
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
      setResult({ number: jo.number, offline: false, joId: jo.id, hasPpi: chosenServices.some(x => /ppi/i.test(x.typeName)) })
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
          {!result.offline && !result.draft && result.joId && result.hasPpi && onStartPPI && (
            <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={() => result.joId && onStartPPI(result.joId)}>
              <i className="ti ti-clipboard-list" aria-hidden="true"></i> Iniciar inspeção PPI
            </button>
          )}
          {!result.offline && !result.draft && result.joId && (
            <button className={result.hasPpi ? 'btn-ghost' : 'btn-primary'} style={{ justifyContent: 'center' }}
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

              {/* Sugestões: o que costuma vir com cada serviço escolhido */}
              {chosenServices.filter(cs => (accompSug[cs.serviceTypeId] || []).length > 0).map(cs => (
                <div key={cs.serviceTypeId} className="accomp-sug">
                  <div className="accomp-sug-head">
                    <i className="ti ti-bulb" aria-hidden="true"></i>
                    "{cs.typeName}" costuma levar — confirma o que se aplica:
                  </div>
                  {(accompSug[cs.serviceTypeId] || []).map((it: any) => {
                    const key = `${cs.serviceTypeId}:${it.label}`
                    return (
                      <button key={key} className={`accomp-sug-item ${accompOn[key] ? 'on' : ''}`}
                        onClick={() => setAccompOn(o => ({ ...o, [key]: !o[key] }))}>
                        <span className="chk-box">{accompOn[key] && <i className="ti ti-check" aria-hidden="true"></i>}</span>
                        <span>{it.label}{it.default_qty ? ` (${it.default_qty}${it.unit ? ' ' + it.unit : ''})` : ''}
                          <span className="accomp-sug-kind">{it.kind === 'service' ? 'serviço' : it.kind === 'material' ? 'material' : 'consumível'}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          )}

          {/* Modo de entrada: escolha quando permitido, automático quando obrigatório */}
          {chosenServices.length > 0 && (
            obrigaCompleta ? (
              <div className="info-box" style={{ marginTop: 16 }}>
                <div className="info-box-head"><i className="ti ti-clipboard-list" aria-hidden="true"></i> Entrada completa</div>
                <p>{chosenServices.filter(x => !x.allowsQuickEntry).map(x => x.typeName).join(', ')} exige registo completo (fotos e checklist), por isso este carro faz entrada completa.</p>
              </div>
            ) : podeRapida ? (
              <div style={{ marginTop: 16 }}>
                <label className="fl">Tipo de entrada</label>
                <div className="seg-row">
                  <button className={`seg ${entryMode === 'quick' ? 'on' : ''}`} onClick={() => setEntryMode('quick')}>
                    <i className="ti ti-bolt" aria-hidden="true"></i> Rápida
                  </button>
                  <button className={`seg ${entryMode === 'full' ? 'on' : ''}`} onClick={() => setEntryMode('full')}>
                    <i className="ti ti-clipboard-list" aria-hidden="true"></i> Completa
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 6 }}>Estes serviços permitem entrada rápida. Escolhe completa se preferires registar tudo com fotos.</p>
              </div>
            ) : null
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
      await api(`/api/v1/receptions/${jo.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'delivered', force: true }) })
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
                  <i className="ti ti-battery" aria-hidden="true"></i> Completar entrada
                </button>
              )}
              {!isDraft && !r.signed_at && r.status !== 'delivered' && onSign && (
                <button className="btn-primary btn-sm" onClick={() => onSign(r.id)} title="Completar a assinatura em falta">
                  <i className="ti ti-signature" aria-hidden="true"></i> Assinar agora
                </button>
              )}
              {!isDraft && r.signed_at && r.has_ppi && onOpenPPI && (
                r.ppi_status === 'done'
                  ? <button className="btn-ghost btn-sm" onClick={() => onOpenPPI(r.id)} title="Ver inspeção PPI concluída"><i className="ti ti-clipboard-check" aria-hidden="true"></i> PPI concluído</button>
                  : <button className="btn-primary btn-sm" onClick={() => onOpenPPI(r.id)} title="Abrir inspeção PPI"><i className="ti ti-clipboard-list" aria-hidden="true"></i> {r.ppi_id ? 'Continuar PPI' : 'Abrir PPI'}</button>
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
// ── Acompanhamentos de um tipo de serviço ────────────────────
// O que costuma vir com o serviço: relacionados, materiais,
// consumíveis. Só o dono (pricing:manage) põe preço; o custo e o
// resto qualquer um com config gere. É sempre sugestão no uso.
const KIND_LBL: any = { service: 'Serviço relacionado', material: 'Material', consumable: 'Consumível' }
const KIND_ICON: any = { service: 'ti-tool', material: 'ti-droplet', consumable: 'ti-spray' }

function Accompaniments({ typeId, typeName, say }: { typeId: string; typeName: string; say: (k: 'err' | 'ok', t: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const podePreco = useSession(s => s.can)('pricing:manage')

  const load = () => {
    setLoading(true)
    api(`/api/v1/service-types/${typeId}/accompaniments`).then(r => setRows(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [typeId])

  const criar = async () => {
    if (!novo || novo.label.trim().length < 1) return
    setBusy(true)
    try {
      await api(`/api/v1/service-types/${typeId}/accompaniments`, { method: 'POST', body: JSON.stringify({
        kind: novo.kind, label: novo.label.trim(),
        defaultQty: novo.defaultQty ? parseFloat(novo.defaultQty) : null,
        unit: novo.unit || null,
        defaultPrice: novo.defaultPrice ? parseFloat(novo.defaultPrice) : null,
      }) })
      setNovo(null); load()
    } catch (e: any) { say('err', e?.message || 'Não foi possível guardar.') }
    finally { setBusy(false) }
  }
  const remover = async (aid: string) => {
    try { await api(`/api/v1/service-types/accompaniments/${aid}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }); load() }
    catch { say('err', 'Não foi possível remover.') }
  }

  return (
    <div className="accomp">
      <div className="accomp-head">O que costuma vir com “{typeName}”</div>
      <p className="accomp-hint">Isto é lembrado quando se adiciona o serviço a um carro — sempre por confirmação.</p>

      {loading && <p className="hint">A carregar…</p>}
      {!loading && rows.length === 0 && !novo && <p className="hint">Ainda nada. Acrescenta o que costuma acompanhar este serviço.</p>}

      {rows.map((r: any) => (
        <div key={r.id} className="accomp-row">
          <i className={`ti ${KIND_ICON[r.kind]}`} aria-hidden="true"></i>
          <div className="accomp-info">
            <div className="accomp-label">{r.label}
              {r.default_qty && <span className="accomp-qty">{r.default_qty}{r.unit ? ` ${r.unit}` : ''}</span>}
            </div>
            <div className="accomp-meta">{KIND_LBL[r.kind]}{r.default_price != null ? ` · ${r.default_price} MT` : ''}</div>
          </div>
          <button className="mdl-edit" onClick={() => remover(r.id)} title="Remover"><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
      ))}

      {novo ? (
        <div className="accomp-form">
          <div className="seg-row" style={{ marginBottom: 8 }}>
            {['service', 'material', 'consumable'].map(k => (
              <button key={k} className={`seg ${novo.kind === k ? 'on' : ''}`} onClick={() => setNovo({ ...novo, kind: k })}>{KIND_LBL[k]}</button>
            ))}
          </div>
          <input placeholder={novo.kind === 'consumable' ? 'ex: Consumíveis diversos' : novo.kind === 'material' ? 'ex: Líquido de refrigeração' : 'ex: Mudança de óleo'}
            value={novo.label} onChange={e => setNovo({ ...novo, label: e.target.value })} autoFocus />
          {novo.kind === 'material' && (
            <div className="accomp-form-row">
              <input type="number" inputMode="decimal" placeholder="qtd" value={novo.defaultQty || ''} onChange={e => setNovo({ ...novo, defaultQty: e.target.value })} style={{ flex: 1 }} />
              <input placeholder="unidade (L, un)" value={novo.unit || ''} onChange={e => setNovo({ ...novo, unit: e.target.value })} style={{ flex: 1 }} />
            </div>
          )}
          {podePreco && (
            <input type="number" inputMode="decimal" placeholder="preço ao cliente (MT) — opcional" value={novo.defaultPrice || ''} onChange={e => setNovo({ ...novo, defaultPrice: e.target.value })} style={{ marginTop: 8 }} />
          )}
          <div className="wf-nav" style={{ marginTop: 10 }}>
            <button className="btn-ghost btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={busy || novo.label.trim().length < 1} onClick={criar}>Acrescentar</button>
          </div>
        </div>
      ) : (
        <button className="accomp-add" onClick={() => setNovo({ kind: 'material', label: '', defaultQty: '', unit: '', defaultPrice: '' })}>
          <i className="ti ti-plus" aria-hidden="true"></i> Acrescentar
        </button>
      )}
    </div>
  )
}

function ServiceTypes({ onBack }: { onBack: () => void }) {
  const [types, setTypes] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)   // tipo a editar, ou {} para novo
  const [name, setName] = useState('')
  const [presence, setPresence] = useState('leaves')
  const [allowQuick, setAllowQuick] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [accompFor, setAccompFor] = useState<string | null>(null)

  const load = () => api('/api/v1/service-types?all=1').then(r => setTypes(r.data || [])).catch(() => {})
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing({}); setName(''); setPresence('leaves'); setAllowQuick(false) }
  const openEdit = (t: any) => { setEditing(t); setName(t.name); setPresence(t.client_presence); setAllowQuick(!!t.allows_quick_entry) }
  const close = () => { setEditing(null); setName(''); setPresence('leaves'); setAllowQuick(false) }

  const save = async () => {
    if (name.trim().length < 2) return
    setBusy(true); setMsg(null)
    try {
      if (editing.id) await api(`/api/v1/service-types/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name, clientPresence: presence, allowsQuickEntry: allowQuick }) })
      else await api('/api/v1/service-types', { method: 'POST', body: JSON.stringify({ name, clientPresence: presence, allowsQuickEntry: allowQuick }) })
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

          <label className="fl" style={{ marginTop: 14 }}>Modo de entrada</label>
          <button className={`chk ${allowQuick ? 'on' : ''}`} style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setAllowQuick(!allowQuick)}>
            <span className="chk-box">{allowQuick && <i className="ti ti-check" aria-hidden="true"></i>}</span>
            Permite entrada rápida
          </button>
          <p className="hint" style={{ marginTop: 6 }}>Por omissão, todos os serviços fazem entrada completa (14 fotos e checklist). Liga isto só para serviços rápidos onde a ficha completa é dispensável. Basta um serviço não permitir rápida para o carro todo ir pela completa.</p>

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
              <div key={t.id} className={`stype-row-wrap ${!t.active ? 'off' : ''}`}>
                <div className="stype-row">
                <div className="stype-main" onClick={() => openEdit(t)}>
                  <div className="stype-name">{t.name}{!t.active && <span className="stype-off-tag">desactivado</span>}</div>
                  <div className="stype-sub">Por omissão: {t.client_presence === 'waits' ? 'cliente espera' : 'deixa o carro'}{t.allows_quick_entry ? ' · permite rápida' : ' · entrada completa'}</div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setAccompFor(accompFor === t.id ? null : t.id)} title="O que costuma vir com este serviço">
                  <i className="ti ti-list-details" aria-hidden="true"></i>
                </button>
                <button className="btn-ghost btn-sm" onClick={() => toggleActive(t)} title={t.active ? 'Desactivar' : 'Reactivar'}>
                  <i className={`ti ${t.active ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true"></i>
                </button>
                </div>
              {accompFor === t.id && <Accompaniments typeId={t.id} typeName={t.name} say={(k, tx) => setMsg({ kind: k, text: tx })} />}
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
// ── MENU DE PPIs — lista de todas as inspeções ───────────────
function PPIList({ onBack, onOpen }: { onBack: () => void; onOpen: (joId: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'' | 'in_progress' | 'done'>('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const carregar = () => {
    setLoading(true)
    api(`/api/v1/ppi${filtro ? `?status=${filtro}` : ''}`)
      .then(r => { setRows(r.inspections || []); setErr(null) })
      .catch(e => setErr(e?.message || 'Não foi possível carregar as inspeções.'))
      .finally(() => setLoading(false))
  }
  useEffect(carregar, [filtro])

  const nivelLabel = (l: string) => l === 'basic' ? 'Básico' : l === 'standard' ? 'Standard' : 'Premium'
  const fmtData = (s: string) => { try { return new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) } catch { return '' } }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 14 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Inspeções PPI</h2><span />
      </div>

      <div className="ppi-filter">
        <button className={`ppi-filter-btn ${filtro === '' ? 'on' : ''}`} onClick={() => setFiltro('')}>Todas</button>
        <button className={`ppi-filter-btn ${filtro === 'in_progress' ? 'on' : ''}`} onClick={() => setFiltro('in_progress')}>Em curso</button>
        <button className={`ppi-filter-btn ${filtro === 'done' ? 'on' : ''}`} onClick={() => setFiltro('done')}>Concluídas</button>
      </div>

      {loading && <p className="hint" style={{ marginTop: 20 }}>A carregar…</p>}
      {err && <div className="pending-box"><p style={{ color: 'var(--danger)' }}>{err}</p></div>}
      {!loading && !err && rows.length === 0 && (
        <div className="empty-state" style={{ marginTop: 30 }}>
          <i className="ti ti-clipboard-list" aria-hidden="true" style={{ fontSize: 32, color: 'var(--ink-3)' }}></i>
          <p className="hint">Ainda não há inspeções {filtro === 'done' ? 'concluídas' : filtro === 'in_progress' ? 'em curso' : ''}.</p>
        </div>
      )}

      {!loading && rows.map(r => (
        <button key={r.id} className="ppi-row" onClick={() => onOpen(r.job_order_id || r.jo_id)}>
          <div className="ppi-row-main">
            <div className="ppi-row-veh">{r.plate} · {r.brand} {r.model}</div>
            <div className="ppi-row-sub">{r.customer_name} · {r.jo_number}</div>
          </div>
          <div className="ppi-row-side">
            <span className={`ppi-badge ${r.status === 'done' ? 'done' : 'prog'}`}>
              {r.status === 'done' ? 'Concluída' : 'Em curso'}
            </span>
            <span className="ppi-row-lvl">{nivelLabel(r.level)}</span>
            <span className="ppi-row-date">{fmtData(r.done_at || r.started_at)}</span>
          </div>
        </button>
      ))}
    </main>
  )
}

// ── Passo 1 do workflow PPI: caracterização do veículo ───────
// Condiciona o resto do circuito (nos pacotes seguintes). Um ecrã,
// guiado, otimizado para telemóvel — o padrão do novo workflow.
// ── Novidades: página completa ───────────────────────────────
function UpdatesPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api('/api/v1/updates').then(r => setRows(r.updates || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  const data = (s: string) => { try { return new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return '' } }
  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 14 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Novidades</h2><span />
      </div>
      {loading && <p className="hint">A carregar…</p>}
      {!loading && rows.length === 0 && <p className="hint">Ainda não há novidades registadas.</p>}
      {rows.map((u, i) => (
        <div key={i} className="upd-card">
          <div className="upd-head">
            <span className="upd-title">{u.title}</span>
            <span className="upd-meta">{u.version} · {data(u.released_at)}</span>
          </div>
          <ul className="upd-items">
            {(u.items || []).map((it: string, j: number) => <li key={j}>{it}</li>)}
          </ul>
        </div>
      ))}
    </main>
  )
}

// ── Novidades: popup do que mudou desde a última visita ──────
function UpdatesPopup({ updates, primeiraVez, onClose }: { updates: any[]; primeiraVez: boolean; onClose: () => void }) {
  return (
    <div className="upd-overlay" onClick={onClose}>
      <div className="upd-modal" onClick={e => e.stopPropagation()}>
        <div className="upd-modal-head">
          <i className="ti ti-sparkles" aria-hidden="true"></i>
          <h3>{primeiraVez ? 'O que há de novo' : `Novidades desde a tua última visita`}</h3>
        </div>
        <p className="upd-modal-sub">
          {updates.length === 1 ? '1 atualização' : `${updates.length} atualizações`} — em resumo:
        </p>
        <div className="upd-modal-body">
          {updates.map((u, i) => (
            <div key={i} className="upd-modal-item">
              <div className="upd-modal-title">{u.title}</div>
              <ul>{(u.items || []).slice(0, 3).map((it: string, j: number) => <li key={j}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>
          Percebi
        </button>
      </div>
    </div>
  )
}

// Parâmetros do template: nível + caracterização (o que não se
// aplica ao carro nem chega a aparecer no circuito).
function paramsTemplate(insp: any) {
  const p = new URLSearchParams()
  p.set('level', insp.level || 'standard')
  if (insp.fuel_type) p.set('fuel', insp.fuel_type)
  if (insp.drivetrain) p.set('drivetrain', insp.drivetrain)
  return p.toString()
}

// ── Gestão do modelo de PPI (secções → pontos → campos) ──────
// Só o dono. Permite editar tudo sem migrations: nomes, dicas,
// níveis, obrigatórios e a que carros cada ponto se aplica.
// Nada se apaga — desativa-se, para não órfãos nas inspeções.
const NIVEIS_LBL: any = { basic: 'Básico', standard: 'Standard', premium: 'Premium' }
const TIPOS_LBL: any = { state: 'Estado', number: 'Número', text: 'Texto', photo: 'Foto', file: 'Ficheiro' }
const FUEL_OPS = [['gasolina', 'Gasolina'], ['diesel', 'Diesel'], ['hibrido', 'Híbrido'], ['eletrico', 'Elétrico']]
const DRIVE_OPS = [['2wd', '2WD'], ['4x4_desligavel', '4x4 desligável'], ['4x4_permanente', '4x4 permanente']]

function PPIModel({ onBack }: { onBack: () => void }) {
  const [tree, setTree] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [edit, setEdit] = useState<any>(null)   // { tipo, id?, dados }
  const [busy, setBusy] = useState(false)

  const carregar = () => {
    setLoading(true)
    api('/api/v1/ppi/model')
      .then(r => setTree(r.sections || []))
      .catch(e => setMsg({ kind: 'err', text: e?.message || 'Não foi possível carregar o modelo.' }))
      .finally(() => setLoading(false))
  }
  useEffect(carregar, [])

  const gravar = async () => {
    if (!edit) return
    setBusy(true)
    const { tipo, id, dados } = edit
    try {
      const base = '/api/v1/ppi/model'
      if (tipo === 'section') {
        if (id) await api(`${base}/section/${id}`, { method: 'PATCH', body: JSON.stringify(dados) })
        else await api(`${base}/section`, { method: 'POST', body: JSON.stringify(dados) })
      } else if (tipo === 'point') {
        if (id) await api(`${base}/point/${id}`, { method: 'PATCH', body: JSON.stringify(dados) })
        else await api(`${base}/point`, { method: 'POST', body: JSON.stringify(dados) })
      } else {
        if (id) await api(`${base}/field/${id}`, { method: 'PATCH', body: JSON.stringify(dados) })
        else await api(`${base}/field`, { method: 'POST', body: JSON.stringify(dados) })
      }
      setEdit(null); carregar()
      setMsg({ kind: 'ok', text: 'Guardado.' })
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Não foi possível guardar.' }) }
    finally { setBusy(false) }
  }

  const campo = (label: string, node: any) => (
    <div className="mdl-f"><label className="fl">{label}</label>{node}</div>
  )

  const formEdit = () => {
    if (!edit) return null
    const d = edit.dados
    const set = (k: string, v: any) => setEdit({ ...edit, dados: { ...d, [k]: v } })
    const toggleLista = (k: string, val: string) => {
      const atual: string[] = d[k] || []
      set(k, atual.includes(val) ? atual.filter(x => x !== val) : [...atual, val])
    }
    return (
      <div className="mdl-form">
        <div className="mdl-form-head">
          {edit.id ? 'Editar' : 'Novo'} {edit.tipo === 'section' ? 'secção' : edit.tipo === 'point' ? 'ponto' : 'campo'}
        </div>

        {edit.tipo === 'field'
          ? campo('Nome do campo', <input value={d.label || ''} onChange={e => set('label', e.target.value)} placeholder="ex: Profundidade do piso" />)
          : campo('Nome', <input value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder={edit.tipo === 'section' ? 'ex: Travões' : 'ex: Travão de mão'} />)}

        {edit.tipo === 'field' && (
          <>
            {campo('Tipo', (
              <div className="seg-row">
                {Object.keys(TIPOS_LBL).map(t => (
                  <button key={t} className={`seg ${d.fieldType === t ? 'on' : ''}`} onClick={() => set('fieldType', t)}>{TIPOS_LBL[t]}</button>
                ))}
              </div>
            ))}
            {d.fieldType === 'number' && campo('Unidade', <input value={d.unit || ''} onChange={e => set('unit', e.target.value)} placeholder="mm, V, bar, cv" />)}
            <button className={`chk ${d.required ? 'on' : ''}`} style={{ width: '100%', justifyContent: 'flex-start', marginTop: 8 }}
              onClick={() => set('required', !d.required)}>
              <span className="chk-box">{d.required && <i className="ti ti-check" aria-hidden="true"></i>}</span>
              Obrigatório — a inspeção não fecha sem isto
            </button>
          </>
        )}

        {edit.tipo !== 'field' && campo('A partir de que nível aparece', (
          <div className="seg-row">
            {Object.keys(NIVEIS_LBL).map(n => (
              <button key={n} className={`seg ${d.minLevel === n ? 'on' : ''}`} onClick={() => set('minLevel', n)}>{NIVEIS_LBL[n]}</button>
            ))}
          </div>
        ))}

        {edit.tipo === 'point' && (
          <>
            {campo('Dica de inspeção (como e onde testar)', (
              <textarea rows={4} value={d.hint || ''} onChange={e => set('hint', e.target.value)}
                placeholder="ex: Mede nas portas, capô e tejadilho, e sobretudo nas junções com os para-choques..." />
            ))}
            {campo('Só se aplica a estes combustíveis', (
              <div className="mdl-chips">
                {FUEL_OPS.map(([v, l]) => (
                  <button key={v} className={`mdl-chip ${(d.appliesFuel || []).includes(v) ? 'on' : ''}`} onClick={() => toggleLista('appliesFuel', v)}>{l}</button>
                ))}
              </div>
            ))}
            {campo('Só se aplica a estas trações', (
              <div className="mdl-chips">
                {DRIVE_OPS.map(([v, l]) => (
                  <button key={v} className={`mdl-chip ${(d.appliesDrivetrain || []).includes(v) ? 'on' : ''}`} onClick={() => toggleLista('appliesDrivetrain', v)}>{l}</button>
                ))}
              </div>
            ))}
            <p className="hint">Nada escolhido = aplica-se a todos os carros.</p>
          </>
        )}

        {campo('Ordem', <input type="number" value={d.sortOrder ?? 0} onChange={e => set('sortOrder', parseInt(e.target.value || '0', 10))} />)}

        {edit.id && (
          <button className={`chk ${d.active === false ? '' : 'on'}`} style={{ width: '100%', justifyContent: 'flex-start', marginTop: 8 }}
            onClick={() => set('active', d.active === false ? true : false)}>
            <span className="chk-box">{d.active !== false && <i className="ti ti-check" aria-hidden="true"></i>}</span>
            Ativo {d.active === false && '— desativado, deixa de aparecer nas inspeções novas'}
          </button>
        )}

        <div className="wf-nav" style={{ marginTop: 12 }}>
          <button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="btn-primary" disabled={busy} onClick={gravar}>{busy ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    )
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 10 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Modelo de inspeção</h2><span />
      </div>
      {msg && <Banner msg={msg} onClose={() => setMsg(null)} />}
      <p className="hint" style={{ marginBottom: 12 }}>
        O que aqui mudares aplica-se às inspeções novas. As já feitas ficam como estavam.
      </p>

      {loading && <p className="hint">A carregar…</p>}

      {!loading && edit && edit.tipo === 'section' && !edit.id && formEdit()}

      {!loading && tree.map((s: any) => (
        <div key={s.id} className={`mdl-sec ${s.active ? '' : 'off'}`}>
          <button className="mdl-sec-head" onClick={() => setAberta(aberta === s.id ? null : s.id)}>
            <span className="mdl-sec-name">{s.name}</span>
            <span className="mdl-badge">{NIVEIS_LBL[s.min_level]}</span>
            {!s.active && <span className="mdl-off">desativada</span>}
            <span className="mdl-count">{s.points.filter((p: any) => p.active).length}</span>
            <i className={`ti ti-chevron-${aberta === s.id ? 'up' : 'down'}`} aria-hidden="true"></i>
          </button>

          {aberta === s.id && (
            <div className="mdl-sec-body">
              <div className="mdl-actions">
                <button className="btn-ghost btn-sm" onClick={() => setEdit({ tipo: 'section', id: s.id, dados: { name: s.name, minLevel: s.min_level, sortOrder: s.sort_order, active: s.active } })}>
                  <i className="ti ti-pencil" aria-hidden="true"></i> Editar secção
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit({ tipo: 'point', dados: { sectionId: s.id, name: '', minLevel: s.min_level, sortOrder: (s.points.length + 1) * 10, hint: '' } })}>
                  <i className="ti ti-plus" aria-hidden="true"></i> Novo ponto
                </button>
              </div>
              {edit && edit.tipo === 'section' && edit.id === s.id && formEdit()}
              {edit && edit.tipo === 'point' && !edit.id && edit.dados.sectionId === s.id && formEdit()}

              {s.points.map((p: any) => (
                <div key={p.id} className={`mdl-pt ${p.active ? '' : 'off'}`}>
                  <div className="mdl-pt-head">
                    <span className="mdl-pt-name">{p.name}</span>
                    <span className="mdl-badge">{NIVEIS_LBL[p.min_level]}</span>
                    {!p.active && <span className="mdl-off">desativado</span>}
                    <button className="mdl-edit" onClick={() => setEdit({ tipo: 'point', id: p.id, dados: { name: p.name, minLevel: p.min_level, sortOrder: p.sort_order, active: p.active, hint: p.hint || '', appliesFuel: p.applies_fuel || [], appliesDrivetrain: p.applies_drivetrain || [] } })}>
                      <i className="ti ti-pencil" aria-hidden="true"></i>
                    </button>
                  </div>
                  {(p.applies_fuel || p.applies_drivetrain) && (
                    <div className="mdl-aplica">
                      só: {[...(p.applies_fuel || []), ...(p.applies_drivetrain || [])].join(', ')}
                    </div>
                  )}
                  {p.hint && <div className="mdl-hint">{p.hint.length > 120 ? p.hint.slice(0, 120) + '…' : p.hint}</div>}
                  <div className="mdl-fields">
                    {p.fields.map((f: any) => (
                      <button key={f.id} className={`mdl-fld ${f.active ? '' : 'off'}`}
                        onClick={() => setEdit({ tipo: 'field', id: f.id, dados: { label: f.label, fieldType: f.field_type, unit: f.unit || '', required: f.required, sortOrder: f.sort_order, active: f.active, hint: f.hint || '' } })}>
                        {f.label}
                        <span className="mdl-fld-t">{TIPOS_LBL[f.field_type]}</span>
                        {f.required && <span className="mdl-fld-r">obrig.</span>}
                      </button>
                    ))}
                    <button className="mdl-fld add" onClick={() => setEdit({ tipo: 'field', dados: { pointId: p.id, label: '', fieldType: 'state', required: false, sortOrder: (p.fields.length + 1) * 10 } })}>
                      <i className="ti ti-plus" aria-hidden="true"></i> campo
                    </button>
                  </div>
                  {edit && edit.tipo === 'point' && edit.id === p.id && formEdit()}
                  {edit && edit.tipo === 'field' && (edit.id ? p.fields.some((f: any) => f.id === edit.id) : edit.dados.pointId === p.id) && formEdit()}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {!loading && (
        <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
          onClick={() => setEdit({ tipo: 'section', dados: { name: '', minLevel: 'basic', sortOrder: (tree.length + 1) * 10 } })}>
          <i className="ti ti-plus" aria-hidden="true"></i> Nova secção
        </button>
      )}
    </main>
  )
}

// ── Fornecedores (lista simples, só dono) ────────────────────
// ── Tabela de preços de um fornecedor ────────────────────────
function SupplierPrices({ supplierId, say }: { supplierId: string; say: (k: 'err' | 'ok', t: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState<{ label: string; price: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => { setLoading(true); api(`/api/v1/suppliers/${supplierId}/prices`).then(r => setRows(r.prices || [])).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(load, [supplierId])

  const criar = async () => {
    if (!novo || novo.label.trim().length < 1 || !novo.price) return
    setBusy(true)
    try { await api(`/api/v1/suppliers/${supplierId}/prices`, { method: 'POST', body: JSON.stringify({ label: novo.label.trim(), price: parseFloat(novo.price) }) }); setNovo(null); load() }
    catch (e: any) { say('err', e?.message || 'Não foi possível guardar.') }
    finally { setBusy(false) }
  }
  const remover = async (pid: string) => {
    try { await api(`/api/v1/suppliers/prices/${pid}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }); load() }
    catch { say('err', 'Não foi possível remover.') }
  }

  return (
    <div className="supp-prices">
      <div className="supp-prices-head">Preços habituais</div>
      {loading ? <p className="hint">A carregar…</p> : rows.length === 0 && !novo ? (
        <p className="hint">Sem preços definidos. Acrescenta o que este fornecedor costuma cobrar.</p>
      ) : rows.map((p: any) => (
        <div key={p.id} className="supp-price-row">
          <span className="supp-price-label">{p.label}</span>
          <span className="supp-price-val">{p.price} MT</span>
          <button className="mdl-edit" onClick={() => remover(p.id)} title="Remover"><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
      ))}
      {novo ? (
        <div className="supp-price-form">
          <input placeholder="trabalho (ex: Skim de discos)" value={novo.label} onChange={e => setNovo({ ...novo, label: e.target.value })} autoFocus />
          <input type="number" inputMode="decimal" placeholder="preço MT" value={novo.price} onChange={e => setNovo({ ...novo, price: e.target.value })} />
          <div className="wf-nav" style={{ marginTop: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={busy || !novo.label.trim() || !novo.price} onClick={criar}>Guardar</button>
          </div>
        </div>
      ) : (
        <button className="accomp-add" onClick={() => setNovo({ label: '', price: '' })}><i className="ti ti-plus" aria-hidden="true"></i> Acrescentar preço</button>
      )}
    </div>
  )
}

function SuppliersPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [novo, setNovo] = useState<{ name: string; contact: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pricesFor, setPricesFor] = useState<string | null>(null)

  const carregar = () => {
    setLoading(true)
    api('/api/v1/suppliers').then(r => setRows(r.suppliers || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(carregar, [])

  const criar = async () => {
    if (!novo || novo.name.trim().length < 1) return
    setBusy(true)
    try {
      await api('/api/v1/suppliers', { method: 'POST', body: JSON.stringify({ name: novo.name.trim(), contact: novo.contact || null }) })
      setNovo(null); carregar(); setMsg({ kind: 'ok', text: 'Fornecedor criado.' })
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Não foi possível criar.' }) }
    finally { setBusy(false) }
  }
  const desativar = async (id: string) => {
    try { await api(`/api/v1/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }); carregar() }
    catch { setMsg({ kind: 'err', text: 'Não foi possível remover.' }) }
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 12 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Fornecedores</h2><span />
      </div>
      {msg && <Banner msg={msg} onClose={() => setMsg(null)} />}
      <p className="hint" style={{ marginBottom: 12 }}>Os sítios para onde envias serviços terceirizados — como o skim dos discos.</p>

      {loading && <p className="hint">A carregar…</p>}
      {!loading && rows.length === 0 && !novo && <p className="hint">Ainda não há fornecedores.</p>}

      {rows.map((s: any) => (
        <div key={s.id} className="supp-row-wrap">
          <div className="supp-row">
            <div><div className="supp-name">{s.name}</div>{s.contact && <div className="supp-contact">{s.contact}</div>}</div>
            <button className="btn-ghost btn-sm" onClick={() => setPricesFor(pricesFor === s.id ? null : s.id)} title="Tabela de preços">
              <i className="ti ti-currency-dollar" aria-hidden="true"></i>
            </button>
            <button className="mdl-edit" onClick={() => desativar(s.id)} title="Remover"><i className="ti ti-trash" aria-hidden="true"></i></button>
          </div>
          {pricesFor === s.id && <SupplierPrices supplierId={s.id} say={(k, tx) => setMsg({ kind: k, text: tx })} />}
        </div>
      ))}

      {novo ? (
        <div className="mdl-form">
          <div className="mdl-form-head">Novo fornecedor</div>
          <div className="mdl-f"><label className="fl">Nome</label><input value={novo.name} onChange={e => setNovo({ ...novo, name: e.target.value })} placeholder="ex: Retífica Central" autoFocus /></div>
          <div className="mdl-f"><label className="fl">Contacto (opcional)</label><input value={novo.contact} onChange={e => setNovo({ ...novo, contact: e.target.value })} placeholder="telefone, WhatsApp" /></div>
          <div className="wf-nav">
            <button className="btn-ghost" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn-primary" disabled={busy || novo.name.trim().length < 1} onClick={criar}>Guardar</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setNovo({ name: '', contact: '' })}>
          <i className="ti ti-plus" aria-hidden="true"></i> Novo fornecedor
        </button>
      )}
    </main>
  )
}

function PPICharacterise({ insp, busy, onBack, onSave }: {
  insp: any; busy: boolean; onBack: () => void
  onSave: (fuel: string | null, drive: string | null, gear: string | null) => void
}) {
  const [fuel, setFuel] = useState<string | null>(insp.fuel_type || null)
  const [drive, setDrive] = useState<string | null>(insp.drivetrain || null)
  const [gear, setGear] = useState<string | null>(insp.gearbox || null)

  const Opt = ({ val, cur, set, label, icon }: any) => (
    <button className={`char-opt ${cur === val ? 'on' : ''}`} onClick={() => set(cur === val ? null : val)}>
      {icon && <i className={`ti ${icon}`} aria-hidden="true"></i>}
      <span>{label}</span>
    </button>
  )

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 12 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Caracterização</h2><span />
      </div>

      <div className="char-veh">{insp.plate} · {insp.brand} {insp.model}</div>
      <div className="wf-step"><span className="wf-step-num">Passo 1</span> de que carro estamos a falar?</div>

      <div className="char-group">
        <label className="fl">Combustível</label>
        <div className="char-opts">
          <Opt val="gasolina" cur={fuel} set={setFuel} label="Gasolina" icon="ti-gas-station" />
          <Opt val="diesel" cur={fuel} set={setFuel} label="Diesel" icon="ti-gas-station" />
          <Opt val="hibrido" cur={fuel} set={setFuel} label="Híbrido" icon="ti-battery-charging" />
          <Opt val="eletrico" cur={fuel} set={setFuel} label="Elétrico" icon="ti-bolt" />
        </div>
      </div>

      <div className="char-group">
        <label className="fl">Tração</label>
        <div className="char-opts char-opts-1">
          <Opt val="2wd" cur={drive} set={setDrive} label="2 rodas motrizes (2WD)" icon="ti-car" />
          <Opt val="4x4_desligavel" cur={drive} set={setDrive} label="4x4 desligável (part-time)" icon="ti-car-4wd" />
          <Opt val="4x4_permanente" cur={drive} set={setDrive} label="4x4 permanente (full-time)" icon="ti-car-4wd" />
        </div>
        {drive === '4x4_desligavel' && <p className="hint" style={{ marginTop: 6 }}>Dá para dyno: desengata-se a tração e testa-se como 2WD.</p>}
        {drive === '4x4_permanente' && <p className="hint" style={{ marginTop: 6 }}>Não vai ao dyno 2WD — a potência avalia-se por outros meios.</p>}
        {drive === '4x4' && <p className="hint" style={{ marginTop: 6 }}>Registo antigo sem detalhe — escolhe se é desligável ou permanente.</p>}
      </div>

      <div className="char-group">
        <label className="fl">Caixa <span className="opt-tag">opcional</span></label>
        <div className="char-opts">
          <Opt val="manual" cur={gear} set={setGear} label="Manual" />
          <Opt val="automatica" cur={gear} set={setGear} label="Automática" />
        </div>
      </div>

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
        disabled={busy || !fuel || !drive}
        onClick={() => onSave(fuel, drive, gear)}>
        {busy ? 'A guardar…' : 'Continuar para a inspeção'} <i className="ti ti-arrow-right" aria-hidden="true"></i>
      </button>
      {(!fuel || !drive) && <p className="hint" style={{ marginTop: 8, textAlign: 'center' }}>Escolhe pelo menos o combustível e a tração.</p>}
    </main>
  )
}

function PPICircuit({ joId, onBack }: { joId: string; onBack: () => void }) {
  const [insp, setInsp] = useState<any>(null)
  const [tree, setTree] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [stepIdx, setStepIdx] = useState(0)   // secção atual do workflow linear
  const [extras, setExtras] = useState<Record<string, any[]>>({})   // fotos adicionais por campo
  const [shareBusy, setShareBusy] = useState(false)
  const [charBusy, setCharBusy] = useState(false)
  const [showChar, setShowChar] = useState(false)   // mostrar o ecrã de caracterização
  const canShare = useSession(s => s.can)('config:manage')   // só o dono

  const guardarCaracterizacao = async (fuel: string | null, drive: string | null, gear: string | null) => {
    setCharBusy(true)
    try {
      await api(`/api/v1/ppi/${insp.id}/characterise`, { method: 'PUT',
        body: JSON.stringify({ fuelType: fuel, drivetrain: drive, gearbox: gear }) })
      const atualizado = { ...insp, fuel_type: fuel, drivetrain: drive, gearbox: gear, characterised_at: new Date().toISOString() }
      setInsp(atualizado)
      // A caracterização muda o que se aplica: recarregar o circuito.
      try {
        const tpl = await api(`/api/v1/ppi/template?${paramsTemplate(atualizado)}`)
        setTree(tpl.sections || [])
        setStepIdx(0)
      } catch { /* mantém o circuito atual se falhar */ }
      setShowChar(false)
    } catch { setMsg({ kind: 'err', text: 'Não foi possível guardar a caracterização.' }) }
    finally { setCharBusy(false) }
  }

  const criarLink = async (days: number) => {
    setShareBusy(true)
    try {
      const r = await api(`/api/v1/ppi/${insp.id}/share`, { method: 'POST', body: JSON.stringify({ days }) })
      const url = `${window.location.origin}/r/${r.token}`
      setInsp({ ...insp, share_token: r.token, share_expires_at: r.expiresAt })
      try { await navigator.clipboard.writeText(url); setMsg({ kind: 'ok', text: `Link copiado! Válido ${days} dias.` }) }
      catch { setMsg({ kind: 'ok', text: url }) }
    } catch { setMsg({ kind: 'err', text: 'Não foi possível criar o link.' }) }
    finally { setShareBusy(false) }
  }
  const revogar = async () => {
    if (!confirm('Revogar o link? Quem o tiver deixa de conseguir abrir o relatório.')) return
    setShareBusy(true)
    try {
      await api(`/api/v1/ppi/${insp.id}/share`, { method: 'DELETE' })
      setInsp({ ...insp, share_token: null, share_expires_at: null })
      setMsg({ kind: 'ok', text: 'Link revogado.' })
    } catch { setMsg({ kind: 'err', text: 'Não foi possível revogar.' }) }
    finally { setShareBusy(false) }
  }

  useEffect(() => {
    api('/api/v1/ppi/start', { method: 'POST', body: JSON.stringify({ jobOrderId: joId, level: 'standard' }) })
      .then(async (i) => {
        // A inspeção primeiro: é dela que vem a caracterização, e é a
        // caracterização que decide o que o template mostra.
        const full = await api(`/api/v1/ppi/${i.id}`)
        const tpl = await api(`/api/v1/ppi/template?${paramsTemplate(full)}`)
        setInsp(full)
        // Primeiro passo do workflow: se ainda não foi caracterizado e não
        // está concluído, abre o ecrã de caracterização antes do circuito.
        if (!full.characterised_at && full.status !== 'done') setShowChar(true)
        setTree(tpl.sections || [])
        setStepIdx(0)
        const map: Record<string, any> = {}
        for (const a of (full.answers || [])) if (a.field_id) map[a.field_id] = {
          state: a.value_state, number: a.value_number, text: a.value_text, url: a.value_url,
        }
        setAnswers(map)
        const ex: Record<string, any[]> = {}
        for (const at of (full.attachments || [])) if (at.field_id) (ex[at.field_id] ||= []).push({ id: at.id, url: at.url })
        setExtras(ex)
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
      const jaTemPrincipal = !!answers[fieldId]?.url
      if (!jaTemPrincipal) {
        // Primeira foto do campo: fica como principal (compatível com o que já existe).
        await api(`/api/v1/ppi/${insp.id}/answer`, { method: 'PUT',
          body: JSON.stringify({ fieldId, pointId, valuePath: pre.path }) })
        const full = await api(`/api/v1/ppi/${insp.id}`)
        const a = (full.answers || []).find((x: any) => x.field_id === fieldId)
        setAnswers(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], url: a?.value_url } }))
      } else {
        // Já há uma: esta entra como foto adicional do mesmo item.
        const att = await api(`/api/v1/ppi/${insp.id}/attachments`, { method: 'POST',
          body: JSON.stringify({ fieldId, pointId, path: pre.path }) })
        setExtras(prev => ({ ...prev, [fieldId]: [...(prev[fieldId] || []), { id: att.id, url: att.url }] }))
      }
    } catch { setMsg({ kind: 'err', text: 'O anexo nao subiu.' }) }
    finally { setSaving(s => ({ ...s, [fieldId]: false })) }
  }

  const removerExtra = async (fieldId: string, attId: string) => {
    try {
      await api(`/api/v1/ppi/${insp.id}/attachments/${attId}`, { method: 'DELETE' })
      setExtras(prev => ({ ...prev, [fieldId]: (prev[fieldId] || []).filter((x: any) => x.id !== attId) }))
    } catch { setMsg({ kind: 'err', text: 'Não foi possível remover a foto.' }) }
  }

  const STATES = [
    { v: 'bom', label: 'Bom', cls: 'bom' }, { v: 'aceitavel', label: 'Aceitavel', cls: 'acc' },
    { v: 'mau', label: 'Mau', cls: 'mau' }, { v: 'na', label: 'N.A.', cls: 'na' },
  ]

  if (!insp) return (
    <main className="reception"><div className="rec-top"><button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar</button><h2 style={{ margin: 0, fontSize: 18 }}>PPI</h2><span /></div>
      {msg ? <Banner msg={msg} onClose={() => setMsg(null)} /> : <p className="hint" style={{ marginTop: 20 }}>A abrir inspecao...</p>}</main>
  )

  // Passo 1 do workflow: caracterização do veículo.
  if (showChar) return (
    <PPICharacterise insp={insp} busy={charBusy} onBack={onBack}
      onSave={guardarCaracterizacao} />
  )

  // Obrigatórios por preencher — o template já vem filtrado pelo
  // nível e pela caracterização, logo isto é exatamente o que se exige.
  const preenchido = (f: any) => { const a = answers[f.id]; return !!(a && (a.state || a.number != null || a.text || a.url)) }
  const faltamObrig = tree.flatMap((sec: any, si: number) =>
    sec.points.flatMap((p: any) =>
      p.fields.filter((f: any) => f.required && !preenchido(f))
        .map((f: any) => ({ sec: sec.name, ponto: p.name, idx: si }))))

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
          {/* O nível fixa-se na entrada — é uma decisão comercial (o cliente
              pagou um nível). Mudar a meio abriria divergência entre o cobrado
              e o feito, e fraude ao ligar ao orçamento. Mostra-se, não se muda.
              O upgrade formal (com nova cobrança) fica para a Fase 5. */}
          <span className="ppi-level-fixed">
            {insp.level === 'basic' ? 'PPI Básico' : insp.level === 'standard' ? 'PPI Standard' : 'PPI Premium'}
          </span>
        </div>
      </div>
      {insp.characterised_at && (insp.fuel_type || insp.drivetrain) && (
        <div className="char-summary">
          {insp.fuel_type && <span className="char-chip">{insp.fuel_type === 'gasolina' ? 'Gasolina' : insp.fuel_type === 'diesel' ? 'Diesel' : insp.fuel_type === 'hibrido' ? 'Híbrido' : 'Elétrico'}</span>}
          {insp.drivetrain && <span className="char-chip">{insp.drivetrain === '2wd' ? '2WD' : insp.drivetrain === '4x4_desligavel' ? '4x4 desligável' : insp.drivetrain === '4x4_permanente' ? '4x4 permanente' : '4x4'}</span>}
          {insp.gearbox && <span className="char-chip">{insp.gearbox === 'manual' ? 'Manual' : 'Automática'}</span>}
          {insp.status !== 'done' && <button className="char-edit" onClick={() => setShowChar(true)}>Editar</button>}
        </div>
      )}
      <div className="ppi-progress"><div className="ppi-progress-bar" style={{ width: total ? `${Math.round(done / total * 100)}%` : '0%' }} /></div>
      <p className="hint" style={{ marginBottom: 14 }}>{done} de {total} campos preenchidos. Guarda-se sozinho a medida que preenches.</p>

      {/* Inspeção concluída: ações à cabeça, para não ter de rolar até ao fim. */}
      {insp.status === 'done' && (
        <div className="ppi-done-bar">
          <div className="ppi-done-label"><i className="ti ti-circle-check" aria-hidden="true"></i> Inspeção concluída</div>
          <div className="ppi-done-actions">
            {canShare && insp.share_token && insp.share_expires_at && new Date(insp.share_expires_at) > new Date() && (
              <button className="btn-ghost btn-sm" onClick={() => {
                const url = `${window.location.origin}/r/${insp.share_token}`
                navigator.clipboard?.writeText(url).then(() => setMsg({ kind: 'ok', text: 'Link copiado.' })).catch(() => setMsg({ kind: 'ok', text: url }))
              }}><i className="ti ti-copy" aria-hidden="true"></i> Copiar link</button>
            )}
            {canShare && !(insp.share_token && insp.share_expires_at && new Date(insp.share_expires_at) > new Date()) && (
              <button className="btn-primary btn-sm" onClick={() => criarLink(30)} disabled={shareBusy}><i className="ti ti-link" aria-hidden="true"></i> Criar link</button>
            )}
          </div>
        </div>
      )}

      {/* ── Workflow linear: uma secção por ecrã ────────────── */}
      {stepIdx < tree.length ? (
        <>
          <div className="wf-step">
            <span className="wf-step-num">Passo {stepIdx + 2}</span>
            {tree[stepIdx]?.name}
            <span className="wf-step-of">secção {stepIdx + 1} de {tree.length}</span>
          </div>

          <div className="wf-screen">
            {(tree[stepIdx]?.points || []).map((pt: any) => (
              <div key={pt.id} className="ppi-point">
                <div className="ppi-point-name">{pt.name}</div>
                {pt.hint && (
                  <div className="ppi-hint">
                    <i className="ti ti-bulb" aria-hidden="true"></i>
                    <span>{pt.hint}</span>
                  </div>
                )}
                {pt.fields.map((f: any) => {
                  const a = answers[f.id] || {}
                  const busy = saving[f.id]
                  return (
                    <div key={f.id} className="ppi-field">
                      <label className="ppi-field-label">{f.label}{f.unit ? ` (${f.unit})` : ''}
                        {f.required && <span className="ppi-req">obrigatória</span>}
                        {busy && <span className="ppi-saving">a guardar...</span>}</label>
                      {f.hint && <div className="ppi-field-hint">{f.hint}</div>}
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
                          <div className="ppi-gallery">
                            {a.url && (
                              <div className="ppi-thumb">
                                <a href={a.url} target="_blank" rel="noreferrer">
                                  {f.field_type === 'photo'
                                    ? <img src={a.url} alt="" />
                                    : <span className="ppi-thumb-file"><i className="ti ti-file" aria-hidden="true"></i></span>}
                                </a>
                              </div>
                            )}
                            {(extras[f.id] || []).map((ex: any) => (
                              <div key={ex.id} className="ppi-thumb">
                                <a href={ex.url} target="_blank" rel="noreferrer">
                                  {f.field_type === 'photo'
                                    ? <img src={ex.url} alt="" />
                                    : <span className="ppi-thumb-file"><i className="ti ti-file" aria-hidden="true"></i></span>}
                                </a>
                                <button className="ppi-thumb-x" title="Remover" onClick={() => removerExtra(f.id, ex.id)}>
                                  <i className="ti ti-x" aria-hidden="true"></i>
                                </button>
                              </div>
                            ))}
                            <label className="ppi-add-photo">
                              <i className={`ti ${f.field_type === 'photo' ? 'ti-camera-plus' : 'ti-file-upload'}`} aria-hidden="true"></i>
                              <span>{(a.url || (extras[f.id] || []).length) ? 'Mais' : (f.field_type === 'photo' ? 'Foto' : 'Ficheiro')}</span>
                              <input type="file" accept={f.field_type === 'photo' ? 'image/*' : 'application/pdf,image/*'} {...(f.field_type === 'photo' ? { capture: 'environment' } : {})} style={{ display: 'none' }}
                                onChange={e => { const file = e.target.files?.[0]; if (file) attach(f.id, pt.id, file); e.target.value = '' }} />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="wf-nav">
            <button className="btn-ghost" onClick={() => stepIdx === 0 ? (insp.status === 'done' ? onBack() : setShowChar(true)) : setStepIdx(stepIdx - 1)}>
              <i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior
            </button>
            <button className="btn-primary" onClick={() => { setStepIdx(stepIdx + 1); window.scrollTo(0, 0) }}>
              {stepIdx === tree.length - 1 ? 'Rever e concluir' : 'Seguinte'} <i className="ti ti-arrow-right" aria-hidden="true"></i>
            </button>
          </div>

          {/* Saltar para outra secção já visitada */}
          <div className="wf-jump">
            {tree.map((s: any, i: number) => {
              const feitos = s.points.reduce((m: number, p: any) => m + p.fields.filter((f: any) => { const a = answers[f.id]; return a && (a.state || a.number != null || a.text || a.url) }).length, 0)
              const totalSec = s.points.reduce((m: number, p: any) => m + p.fields.length, 0)
              return (
                <button key={s.id} className={`wf-dot ${i === stepIdx ? 'on' : ''} ${feitos > 0 && feitos >= totalSec ? 'full' : feitos > 0 ? 'part' : ''}`}
                  title={s.name} onClick={() => { setStepIdx(i); window.scrollTo(0, 0) }}>{i + 1}</button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          {/* ── Ecrã final: rever e concluir ─────────────────── */}
          <div className="wf-step"><span className="wf-step-num">Último passo</span> Rever e concluir</div>
          {(insp.fuel_type || insp.drivetrain) && (
            <p className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
              O circuito mostra só o que se aplica a este carro
              {insp.drivetrain === '2wd' ? ' (2WD — a secção de tração 4x4 não aparece)'
                : insp.drivetrain === '4x4_permanente' ? ' (4x4 permanente — o dinamómetro não aparece)'
                : insp.fuel_type === 'eletrico' ? ' (elétrico — os pontos de combustão não aparecem)' : ''}.
            </p>
          )}

          <div className="wf-review">
            {tree.map((s: any, i: number) => {
              const feitos = s.points.reduce((m: number, p: any) => m + p.fields.filter((f: any) => { const a = answers[f.id]; return a && (a.state || a.number != null || a.text || a.url) }).length, 0)
              const totalSec = s.points.reduce((m: number, p: any) => m + p.fields.length, 0)
              const completa = totalSec > 0 && feitos >= totalSec
              return (
                <button key={s.id} className="wf-review-row" onClick={() => { setStepIdx(i); window.scrollTo(0, 0) }}>
                  <span className={`wf-review-ic ${completa ? 'full' : feitos > 0 ? 'part' : 'empty'}`}>
                    <i className={`ti ${completa ? 'ti-check' : feitos > 0 ? 'ti-dots' : 'ti-minus'}`} aria-hidden="true"></i>
                  </span>
                  <span className="wf-review-name">{s.name}</span>
                  <span className="wf-review-count">{feitos}/{totalSec}</span>
                </button>
              )
            })}
          </div>

          <div className="wf-nav" style={{ marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => { setStepIdx(tree.length - 1); window.scrollTo(0, 0) }}>
              <i className="ti ti-arrow-left" aria-hidden="true"></i> Voltar à inspeção
            </button>
          </div>

          {faltamObrig.length > 0 && (
            <div className="warn-box" style={{ marginTop: 12 }}>
              <div className="warn-box-head"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Faltam {faltamObrig.length === 1 ? 'uma foto obrigatória' : `${faltamObrig.length} itens obrigatórios`}</div>
              <p>A inspeção só fecha depois destes:</p>
              <div className="falta-list">
                {faltamObrig.slice(0, 10).map((f: any, i: number) => (
                  <button key={i} className="falta-item" onClick={() => { setStepIdx(f.idx); window.scrollTo(0, 0) }}>
                    <i className="ti ti-camera" aria-hidden="true"></i> {f.ponto}
                    <span className="falta-sec">{f.sec}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
            disabled={insp.status === 'done' || faltamObrig.length > 0}
            onClick={async () => {
              try {
                await api(`/api/v1/ppi/${insp.id}/done`, { method: 'POST' })
                setInsp({ ...insp, status: 'done' })
                setMsg({ kind: 'ok', text: 'Inspeção concluída. Está tudo guardado.' })
              } catch (e: any) {
                setMsg({ kind: 'err', text: e?.message || 'Faltam itens obrigatórios para fechar a inspeção.' })
              }
            }}>
            {insp.status === 'done' ? 'Inspeção concluída' : faltamObrig.length > 0 ? 'Faltam itens obrigatórios' : 'Concluir inspeção'} <i className="ti ti-circle-check" aria-hidden="true"></i>
          </button>
      {/* Partilha — só o dono. Criar, estender, reabrir, revogar. */}
      {canShare && (
        <div className="share-box">
          <div className="share-head"><i className="ti ti-link" aria-hidden="true"></i> Link para o cliente</div>
          {insp.share_token && insp.share_expires_at && new Date(insp.share_expires_at) > new Date() ? (
            <>
              <p className="share-status ok">Ativo · expira {new Date(insp.share_expires_at).toLocaleDateString('pt-PT')}</p>
              <div className="share-actions">
                <button className="btn-ghost btn-sm" onClick={() => {
                  const url = `${window.location.origin}/r/${insp.share_token}`
                  navigator.clipboard?.writeText(url).then(() => setMsg({ kind: 'ok', text: 'Link copiado.' })).catch(() => setMsg({ kind: 'ok', text: url }))
                }}><i className="ti ti-copy" aria-hidden="true"></i> Copiar</button>
                <button className="btn-ghost btn-sm" onClick={() => criarLink(30)} disabled={shareBusy}><i className="ti ti-clock-plus" aria-hidden="true"></i> Estender +30d</button>
                <button className="btn-ghost btn-sm danger" onClick={revogar} disabled={shareBusy}><i className="ti ti-link-off" aria-hidden="true"></i> Revogar</button>
              </div>
            </>
          ) : insp.share_token ? (
            <>
              <p className="share-status exp">Expirou {insp.share_expires_at ? new Date(insp.share_expires_at).toLocaleDateString('pt-PT') : ''}</p>
              <div className="share-actions">
                <button className="btn-primary btn-sm" onClick={() => criarLink(30)} disabled={shareBusy}><i className="ti ti-refresh" aria-hidden="true"></i> Reabrir por 30 dias</button>
                <button className="btn-ghost btn-sm" onClick={() => criarLink(7)} disabled={shareBusy}>7 dias</button>
                <button className="btn-ghost btn-sm" onClick={() => criarLink(90)} disabled={shareBusy}>90 dias</button>
              </div>
            </>
          ) : (
            <>
              <p className="share-status">Ainda sem link. Cria um para enviar ao cliente.</p>
              <div className="share-actions">
                <button className="btn-primary btn-sm" onClick={() => criarLink(30)} disabled={shareBusy}><i className="ti ti-link" aria-hidden="true"></i> {shareBusy ? 'A criar…' : 'Criar link (30 dias)'}</button>
                <button className="btn-ghost btn-sm" onClick={() => criarLink(7)} disabled={shareBusy}>7 dias</button>
                <button className="btn-ghost btn-sm" onClick={() => criarLink(90)} disabled={shareBusy}>90 dias</button>
              </div>
            </>
          )}
        </div>
      )}

        </>
      )}

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

// ── FILA DE QC (carros prontos à espera de controlo de qualidade) ─
function QCQueue({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api('/api/v1/os/awaiting-qc').then(r => setList(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  const fmt = (s: string) => s ? new Date(s).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Controlo de qualidade</h2><span />
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>Carros prontos à espera do controlo de qualidade de saída. Nenhum pode ser entregue sem o QC aprovado.</p>
      {loading ? <p className="empty">A carregar…</p> : list.length === 0 ? (
        <p className="empty">Nenhum carro à espera de QC.</p>
      ) : (
        <div className="prob-list">
          {list.map(o => (
            <button key={o.id} className="auth-row" onClick={() => onOpen(o.id)}>
              <div className="auth-main">
                <div className="auth-veh">{o.brand} {o.model} · {o.plate}</div>
                <div className="auth-sub">{o.customer_name} · OS {o.number}</div>
                <div className="auth-meta">Pronto {o.updated_at ? `desde ${fmt(o.updated_at)}` : ''}{o.qc_status === 'rejected' ? ' · QC reprovado, a corrigir' : ''}</div>
              </div>
              <i className="ti ti-shield auth-arrow" aria-hidden="true"></i>
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

function ConfirmBox({ ask, onYes, onNo }: { ask: any | null; onYes: (reason?: string) => void; onNo: () => void }) {
  const [reason, setReason] = useState('')
  useEffect(() => { setReason('') }, [ask])
  if (!ask) return null
  const precisaMotivo = !!ask.needsReason
  return (
    <div className="modal-scrim" onClick={onNo}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{ask.text}</div>
        {ask.detail && <p className="modal-detail">{ask.detail}</p>}
        {precisaMotivo && (
          <textarea className="modal-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)}
            placeholder={ask.reasonPlaceholder || 'motivo…'} autoFocus />
        )}
        <div className="rec-nav" style={{ marginTop: 18 }}>
          <button className="btn-ghost" onClick={onNo}>Cancelar</button>
          <button className={ask.danger ? 'btn-ghost danger' : 'btn-primary'}
            disabled={precisaMotivo && reason.trim().length < 2}
            onClick={() => onYes(precisaMotivo ? reason.trim() : undefined)}>{ask.yes || 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── ORDEM DE SERVIÇO — Fatia 1: Diagnóstico ──────────────────
// ── Estado de um serviço, com mudança e histórico ────────────
// Login = assinatura: quem muda fica no registo, sem assinar.
// Qualquer transição é possível (inclui recuar); só se pede
// motivo quando faz sentido (recuo, "não feito", pausa).
const SVC_STATES: [string, string, string][] = [
  ['awaiting_diagnosis', 'Aguarda diagnóstico', 'ti-search'],
  ['pending', 'Por começar', 'ti-clock'],
  ['in_progress', 'Em execução', 'ti-tool'],
  ['awaiting_approval', 'Aguarda aprovação', 'ti-user-question'],
  ['awaiting_part', 'Aguarda peça', 'ti-package'],
  ['on_hold', 'Em pausa', 'ti-player-pause'],
  ['done', 'Concluído', 'ti-check'],
  ['not_done', 'Não feito', 'ti-x'],
]
const svcLabel = (s: string) => (SVC_STATES.find(x => x[0] === s) || ['', s, ''])[1]
const svcIcon = (s: string) => (SVC_STATES.find(x => x[0] === s) || ['', '', 'ti-point'])[2]
const svcClass = (s: string) =>
  s === 'done' ? 'ok' : s === 'not_done' ? 'no' :
  s === 'in_progress' ? 'go' : (s === 'awaiting_part' || s === 'awaiting_approval' || s === 'on_hold') ? 'wait' : 'idle'
// Estados que, por serem recuo ou decisão, pedem um motivo.
const PEDE_MOTIVO = ['awaiting_part', 'on_hold', 'not_done', 'awaiting_diagnosis']
const ORDEM: Record<string, number> = { awaiting_diagnosis: 0, pending: 1, in_progress: 2, awaiting_approval: 3, awaiting_part: 3, on_hold: 3, done: 4, not_done: 4 }

// ── QC de saída — checklist antes da entrega ─────────────────
// Fecha o buraco que deixou um carro sair sem controlo. Não se
// entrega sem QC aprovado (imposto também no backend).
function QCPanel({ joId, say, onDelivered }: { joId: string; say: (k: 'err' | 'ok', t: string) => void; onDelivered: () => void }) {
  const [data, setData] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejReason, setRejReason] = useState('')
  const [respOk, setRespOk] = useState(false)

  const load = () => api(`/api/v1/os/${joId}/qc`).then(setData).catch(() => {})
  useEffect(() => { if (open && !data) load() }, [open])

  const aprovado = data?.check?.status === 'approved'
  const reprovado = data?.check?.status === 'rejected'
  const tecnicos = (data?.items || []).filter((i: any) => i.section === 'technical')
  const cliente = (data?.items || []).filter((i: any) => i.section === 'with_client')
  const obrigFaltam = (data?.items || []).filter((i: any) => i.required && !i.answer?.checked).length

  const marcar = async (itemId: string, checked: boolean) => {
    // otimista
    setData((d: any) => ({ ...d, items: d.items.map((i: any) => i.id === itemId ? { ...i, answer: { ...i.answer, checked } } : i) }))
    try { await api(`/api/v1/os/${joId}/qc/item`, { method: 'POST', body: JSON.stringify({ itemId, checked }) }) }
    catch (e: any) { say('err', 'Não guardou; tente de novo.'); load() }
  }
  const aprovar = async () => {
    setBusy(true)
    try { await api(`/api/v1/os/${joId}/qc/approve`, { method: 'POST' }); await load(); say('ok', 'QC aprovado. O carro pode ser entregue.') }
    catch (e: any) { say('err', e?.message || 'Faltam verificações obrigatórias.') }
    finally { setBusy(false) }
  }
  const reprovar = async () => {
    setBusy(true)
    try { await api(`/api/v1/os/${joId}/qc/reject`, { method: 'POST', body: JSON.stringify({ reason: rejReason }) }); setRejecting(false); setRejReason(''); await load(); say('ok', 'QC reprovado — volta para correção.') }
    catch (e: any) { say('err', e?.message || 'Erro.') }
    finally { setBusy(false) }
  }
  const [delivering, setDelivering] = useState(false)
  const [sigData, setSigData] = useState<string | null>(null)
  const [receiver, setReceiver] = useState('')

  const entregar = async () => {
    setBusy(true)
    try {
      await api(`/api/v1/receptions/${joId}/deliver`, { method: 'POST', body: JSON.stringify({
        signatureBase64: sigData || null,
        receiverName: receiver.trim() || null,
      }) })
      say('ok', 'Carro entregue.'); onDelivered()
    }
    catch (e: any) { say('err', e?.message || 'Não foi possível entregar.') }
    finally { setBusy(false) }
  }

  const Item = ({ it }: { it: any }) => (
    <button className={`qc-item ${it.answer?.checked ? 'on' : ''}`} onClick={() => marcar(it.id, !it.answer?.checked)} disabled={aprovado}>
      <span className="qc-box">{it.answer?.checked && <i className="ti ti-check" aria-hidden="true"></i>}</span>
      <span className="qc-label">{it.label}{it.required && <span className="qc-req">obrig.</span>}{it.conditional_old_parts && it.required && <span className="qc-cond">cliente pediu</span>}</span>
    </button>
  )

  return (
    <div className={`qc-panel ${aprovado ? 'ok' : ''}`}>
      <button className="qc-toggle" onClick={() => setOpen(!open)}>
        <i className={`ti ${aprovado ? 'ti-shield-check' : 'ti-shield'}`} aria-hidden="true"></i>
        <span>Controlo de qualidade de saída</span>
        {aprovado ? <span className="qc-badge ok">Aprovado</span>
          : reprovado ? <span className="qc-badge no">Reprovado</span>
          : <span className="qc-badge pend">Por fazer</span>}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true"></i>
      </button>

      {open && data && (
        <div className="qc-body">
          {aprovado && (
            <div className="qc-approved-note">
              <i className="ti ti-circle-check" aria-hidden="true"></i>
              Aprovado por {data.check.approved_by_name || '—'}{data.check.approved_at ? ` · ${new Date(data.check.approved_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          )}
          {reprovado && data.check.reject_reason && (
            <div className="qc-reject-note"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Reprovado: {data.check.reject_reason}</div>
          )}

          <div className="qc-sec-title">Verificações técnicas</div>
          {tecnicos.map((it: any) => <Item key={it.id} it={it} />)}

          <div className="qc-sec-title">À frente do cliente</div>
          {cliente.map((it: any) => <Item key={it.id} it={it} />)}

          {!aprovado && (
            <>
              {obrigFaltam > 0 && <p className="qc-warn">Faltam {obrigFaltam} {obrigFaltam === 1 ? 'verificação obrigatória' : 'verificações obrigatórias'} para aprovar.</p>}
              {!rejecting && (
                <div className="qc-responsibility">
                  <div className="qc-resp-title"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Responsabilidade sobre o trabalho</div>
                  <p>Este é o último ponto de verificação antes de o carro chegar ao cliente. Ao aprovar, confirmo que verifiquei o trabalho realizado, que o problema do cliente foi resolvido, que não há riscos de segurança evidentes, e que o carro está em condições de ser entregue. Assumo, no âmbito das minhas funções, a responsabilidade por esta verificação. Fica registado que fui eu a aprovar, com a data e a hora.</p>
                  <button className={`chk ${respOk ? 'on' : ''}`} onClick={() => setRespOk(!respOk)}>
                    <span className="chk-box">{respOk && <i className="ti ti-check" aria-hidden="true"></i>}</span>
                    Li e assumo esta responsabilidade
                  </button>
                </div>
              )}
              <div className="qc-actions">
                {!rejecting ? (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => setRejecting(true)}>Reprovar</button>
                    <button className="btn-primary" disabled={busy || obrigFaltam > 0 || !respOk} onClick={aprovar}>Aprovar QC</button>
                  </>
                ) : (
                  <div style={{ width: '100%' }}>
                    <label className="fl">Motivo da reprovação</label>
                    <textarea rows={2} value={rejReason} onChange={e => setRejReason(e.target.value)} placeholder="o que está mal e volta para corrigir" />
                    <div className="wf-nav" style={{ marginTop: 8 }}>
                      <button className="btn-ghost btn-sm" onClick={() => setRejecting(false)}>Cancelar</button>
                      <button className="btn-primary btn-sm" disabled={busy || rejReason.trim().length < 2} onClick={reprovar}>Confirmar reprovação</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {aprovado && !delivering && (
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setDelivering(true)}>
              <i className="ti ti-key" aria-hidden="true"></i> Entregar ao cliente
            </button>
          )}
          {aprovado && delivering && (
            <div className="qc-deliver">
              <div className="qc-sec-title" style={{ marginTop: 4 }}>Entrega</div>
              <label className="fl">Quem levanta o carro (se não for o cliente)</label>
              <input value={receiver} onChange={e => setReceiver(e.target.value)} placeholder="opcional — nome de quem recebe" />
              <label className="fl" style={{ marginTop: 12 }}>Assinatura do cliente <span className="opt-tag">opcional</span></label>
              <p className="hint" style={{ marginTop: 2, marginBottom: 8 }}>Se o cliente estiver presente, pode assinar a confirmar que recebeu o carro conforme. Se não, entrega-se na mesma.</p>
              <SignaturePad onChange={setSigData} />
              <div className="wf-nav" style={{ marginTop: 12 }}>
                <button className="btn-ghost" onClick={() => { setDelivering(false); setSigData(null); setReceiver('') }}>Voltar</button>
                <button className="btn-primary" disabled={busy} onClick={entregar}>
                  {sigData ? 'Entregar com assinatura' : 'Entregar sem assinatura'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ServiceRow({ svc, onChanged, say, team, responsibleId }: { svc: any; onChanged: () => void; say: (k: 'err' | 'ok', t: string) => void; team: any[]; responsibleId?: string | null }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hist, setHist] = useState<any[] | null>(null)
  const [pend, setPend] = useState<string | null>(null)   // estado à espera de motivo
  const [motivo, setMotivo] = useState('')
  const [outOpen, setOutOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierPrices, setSupplierPrices] = useState<any[]>([])
  useEffect(() => {
    if (svc.supplier_id) {
      api(`/api/v1/suppliers/${svc.supplier_id}/prices`).then(r => setSupplierPrices(r.prices || [])).catch(() => setSupplierPrices([]))
    } else setSupplierPrices([])
  }, [svc.supplier_id])
  const [showWorkers, setShowWorkers] = useState(false)
  const podeFinance = useSession(s => s.can)('finance:read')
  const podePreco = useSession(s => s.can)('pricing:manage')
  const podeCusto = useSession(s => s.can)('cost:register')
  const [depts, setDepts] = useState<any[]>([])
  useEffect(() => { if (podePreco) api('/api/v1/departments').then(r => setDepts(r.data || [])).catch(() => {}) }, [podePreco])

  const OUT_LBL: any = { none: '', sent: 'Enviado ao fornecedor', at_supplier: 'No fornecedor', returned: 'Voltou do fornecedor' }
  const workers: any[] = svc.workers || []
  const temResponsavel = workers.some((w: any) => w.userId === responsibleId)

  const addWorker = async (userId: string, isHelper: boolean) => {
    try { await api(`/api/v1/os/services/${svc.id}/workers`, { method: 'POST', body: JSON.stringify({ userId, isHelper }) }); onChanged() }
    catch (e: any) { say('err', e?.message || 'Não foi possível registar.') }
  }
  const removeWorker = async (userId: string) => {
    try { await api(`/api/v1/os/services/${svc.id}/workers/${userId}`, { method: 'DELETE' }); onChanged() }
    catch { say('err', 'Não foi possível remover.') }
  }

  const abrirOut = async () => {
    setOutOpen(!outOpen)
    if (!outOpen && suppliers.length === 0) {
      try { const r = await api('/api/v1/suppliers'); setSuppliers(r.suppliers || []) } catch {}
    }
  }
  const gravarOut = async (patch: any) => {
    setBusy(true)
    try {
      await api(`/api/v1/os/services/${svc.id}/outsource`, { method: 'POST', body: JSON.stringify(patch) })
      onChanged()
    } catch (e: any) { say('err', e?.message || 'Não foi possível guardar.') }
    finally { setBusy(false) }
  }

  const gravarPreco = async (patch: any) => {
    try {
      await api(`/api/v1/os/services/${svc.id}/pricing`, { method: 'POST', body: JSON.stringify(patch) })
      onChanged()
    } catch (e: any) { say('err', e?.message || 'Não foi possível guardar o preço.') }
  }

  const mudar = async (novo: string, reason?: string) => {
    setBusy(true)
    try {
      await api(`/api/v1/os/services/${svc.id}/status`, { method: 'POST',
        body: JSON.stringify({ status: novo, reason: reason || null }) })
      setOpen(false); setPend(null); setMotivo('')
      // Ao concluir, pergunta quem trabalhou. Se ainda não há ninguém
      // e há um responsável do carro, entra ele por defeito.
      if (novo === 'done') {
        if ((svc.workers || []).length === 0 && responsibleId) {
          await api(`/api/v1/os/services/${svc.id}/workers`, { method: 'POST', body: JSON.stringify({ userId: responsibleId, isHelper: false }) })
        }
        setShowWorkers(true)
      }
      onChanged()
    } catch (e: any) { say('err', e?.message || 'Não foi possível mudar o estado.') }
    finally { setBusy(false) }
  }

  const escolher = (novo: string) => {
    if (novo === svc.status) { setOpen(false); return }
    const recuo = (ORDEM[novo] ?? 9) < (ORDEM[svc.status] ?? 0)
    if (PEDE_MOTIVO.includes(novo) || recuo) { setPend(novo); return }  // pede motivo
    mudar(novo)
  }

  const verHist = async () => {
    if (hist) { setHist(null); return }
    try { const r = await api(`/api/v1/os/services/${svc.id}/history`); setHist(r.history || []) }
    catch { say('err', 'Não foi possível carregar o histórico.') }
  }

  return (
    <div className="svc-row">
      <div className="svc-main">
        <div className="svc-name">{svc.type_name}
          {svc.source === 'diagnosis' && <span className="svc-src">do diagnóstico</span>}
        </div>
        <button className={`svc-state ${svcClass(svc.status)}`} onClick={() => setOpen(!open)} disabled={busy}>
          <i className={`ti ${svcIcon(svc.status)}`} aria-hidden="true"></i> {svcLabel(svc.status)}
          <i className="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
      </div>
      {svc.status_note && <div className="svc-note">{svc.status_note}</div>}
      {svc.assigned_name && <div className="svc-assigned">com {svc.assigned_name}</div>}

      {open && !pend && (
        <div className="svc-picker">
          {SVC_STATES.map(([v, l, ic]) => (
            <button key={v} className={`svc-opt ${v === svc.status ? 'on' : ''}`} onClick={() => escolher(v)} disabled={busy}>
              <i className={`ti ${ic}`} aria-hidden="true"></i> {l}
            </button>
          ))}
        </div>
      )}

      {pend && (
        <div className="svc-motivo">
          <label className="fl">Porquê passa a "{svcLabel(pend)}"?</label>
          <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder={pend === 'not_done' ? 'ex: cliente recusou / não era necessário' : pend === 'awaiting_part' ? 'ex: à espera do disco de travão' : 'motivo…'} />
          <div className="wf-nav" style={{ marginTop: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => { setPend(null); setMotivo('') }}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={busy || motivo.trim().length < 2} onClick={() => mudar(pend, motivo)}>Guardar</button>
          </div>
        </div>
      )}

      {svc.outsourced && (
        <div className="svc-out-badge">
          <i className="ti ti-external-link" aria-hidden="true"></i>
          {svc.supplier_name || 'Fornecedor'} · {OUT_LBL[svc.outsource_status] || 'terceirizado'}
        </div>
      )}

      <button className="svc-out-toggle" onClick={abrirOut}>
        <i className="ti ti-building-store" aria-hidden="true"></i> {svc.outsourced ? 'Gerir terceirização' : 'Terceirizar este serviço'}
      </button>
      {outOpen && (
        <div className="svc-out-panel">
          <button className={`chk ${svc.outsourced ? 'on' : ''}`} style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => gravarOut({ outsourced: !svc.outsourced })} disabled={busy}>
            <span className="chk-box">{svc.outsourced && <i className="ti ti-check" aria-hidden="true"></i>}</span>
            É feito por um fornecedor externo
          </button>

          {svc.outsourced && (
            <>
              <label className="fl" style={{ marginTop: 10 }}>Fornecedor</label>
              <select value={svc.supplier_id || ''} onChange={e => gravarOut({ outsourced: true, supplierId: e.target.value || null })} disabled={busy}>
                <option value="">— escolher —</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <label className="fl" style={{ marginTop: 10 }}>Estado</label>
              <div className="seg-row">
                {['sent', 'at_supplier', 'returned'].map(st => (
                  <button key={st} className={`seg ${svc.outsource_status === st ? 'on' : ''}`}
                    onClick={() => gravarOut({ outsourced: true, status: st })} disabled={busy}>
                    {st === 'sent' ? 'Enviado' : st === 'at_supplier' ? 'No fornecedor' : 'Voltou'}
                  </button>
                ))}
              </div>

              {podeFinance && (
                <>
                  {svc.supplier_id && supplierPrices.length > 0 && (
                    <div className="supp-price-sug">
                      <span className="supp-price-sug-label">Preços habituais deste fornecedor:</span>
                      <div className="supp-price-chips">
                        {supplierPrices.map((p: any) => (
                          <button key={p.id} className="supp-price-chip" onClick={() => gravarOut({ outsourced: true, cost: p.price })}>
                            {p.label} · {p.price} MT
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="fl" style={{ marginTop: 10 }}>Custo do fornecedor (MT) <span className="opt-tag">só contas</span></label>
                  <input type="number" inputMode="decimal" key={svc.supplier_cost ?? 'empty'} defaultValue={svc.supplier_cost ?? ''}
                    placeholder="o que o fornecedor cobra"
                    onBlur={e => { const v = e.target.value === '' ? null : parseFloat(e.target.value); gravarOut({ outsourced: true, cost: v }) }} />
                </>
              )}
            </>
          )}
        </div>
      )}

      {(svc.status === 'done' && workers.length > 0 && !showWorkers) && (
        <div className="svc-workers-sum">
          <i className="ti ti-users" aria-hidden="true"></i>
          {workers.map((w: any) => w.name + (w.isHelper ? ' (ajuda)' : '')).join(', ')}
          <button className="svc-workers-edit" onClick={() => setShowWorkers(true)}>alterar</button>
        </div>
      )}

      {showWorkers && (
        <div className="svc-workers-panel">
          <div className="swp-title">Quem trabalhou neste serviço?</div>
          {workers.length > 0 && (
            <div className="swp-chips">
              {workers.map((w: any) => (
                <span key={w.userId} className={`swp-chip ${w.isHelper ? 'help' : ''}`}>
                  {w.name}{w.isHelper && ' · ajuda'}
                  <button onClick={() => removeWorker(w.userId)}><i className="ti ti-x" aria-hidden="true"></i></button>
                </span>
              ))}
            </div>
          )}
          <div className="swp-add">
            <span className="swp-add-label">Acrescentar quem ajudou:</span>
            <div className="swp-add-list">
              {team.filter((m: any) => !workers.some((w: any) => w.userId === m.id)).map((m: any) => (
                <button key={m.id} className="swp-add-btn" onClick={() => addWorker(m.id, true)}>
                  <i className="ti ti-plus" aria-hidden="true"></i> {m.full_name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setShowWorkers(false)}>Pronto</button>
        </div>
      )}

      <button className="svc-hist-toggle" onClick={verHist}>
        <i className="ti ti-history" aria-hidden="true"></i> {hist ? 'Esconder histórico' : 'Histórico'}
      </button>
      {hist && (
        <div className="svc-hist">
          {hist.length === 0 && <div className="svc-hist-empty">Sem transições.</div>}
          {hist.map((h: any, i: number) => (
            <div key={i} className="svc-hist-row">
              <span className="svc-hist-arrow">{h.from_status ? `${svcLabel(h.from_status)} → ` : ''}{svcLabel(h.to_status)}</span>
              <span className="svc-hist-meta">{h.by_name || '—'} · {new Date(h.changed_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              {h.reason && <span className="svc-hist-reason">{h.reason}</span>}
            </div>
          ))}
        </div>
      )}

      {podePreco && (
        <div className="svc-pricing">
          <div className="svc-pricing-title"><i className="ti ti-currency-dollar" aria-hidden="true"></i> Orçamento <span className="opt-tag">só gestão</span></div>
          <div className="svc-pricing-row">
            <div style={{ flex: 1 }}>
              <label className="fl">Preço ao cliente (sem IVA)</label>
              <input type="number" inputMode="decimal" key={svc.price ?? 'empty'} defaultValue={svc.price ?? ''}
                placeholder="0 MT"
                onBlur={e => { const v = e.target.value === '' ? null : parseFloat(e.target.value); gravarPreco({ price: v }) }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="fl">Departamento</label>
              <select value={svc.department_id || ''} onChange={e => gravarPreco({ departmentId: e.target.value || null })}>
                <option value="">— escolher —</option>
                {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
      {podeCusto && (
        <ServiceCosts svcId={svc.id} depts={depts} ownerDeptId={svc.department_id} podeGestao={podePreco} say={say} onChanged={onChanged} />
      )}
    </div>
  )
}

// ── Custos de um serviço ─────────────────────────────────────
// Quem tem cost:register lança custos simples (Yury). Só a gestão
// (podeGestao) vê/usa a cascata de fornecimento interno e valida.
function ServiceCosts({ svcId, depts, ownerDeptId, podeGestao, say, onChanged }: { svcId: string; depts: any[]; ownerDeptId?: string | null; podeGestao: boolean; say: (k: 'err' | 'ok', t: string) => void; onChanged: () => void }) {
  const [costs, setCosts] = useState<any[]>([])
  const [novo, setNovo] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api(`/api/v1/os/services/${svcId}/costs`).then(r => setCosts(r.data || [])).catch(() => {})
  useEffect(() => { load() }, [svcId])

  const CAT: any = { labour: 'Mão de obra', material: 'Material', file: 'Ficheiro/software', outsource: 'Serviço externo', other: 'Outro' }

  const criar = async () => {
    if (!novo || !novo.label.trim() || !novo.amount) return
    setBusy(true)
    try {
      await api(`/api/v1/os/services/${svcId}/costs`, { method: 'POST', body: JSON.stringify({
        category: novo.category, label: novo.label.trim(), amount: parseFloat(novo.amount),
        supplierDepartmentId: podeGestao ? (novo.supplierDepartmentId || null) : null,
      }) })
      setNovo(null); load(); onChanged()
    } catch (e: any) { say('err', e?.message || 'Não guardou.') }
    finally { setBusy(false) }
  }
  const remover = async (cid: string) => { try { await api(`/api/v1/os/costs/${cid}`, { method: 'DELETE' }); load(); onChanged() } catch (e: any) { say('err', e?.message || 'Não removeu.') } }
  const validar = async (cid: string, v: boolean) => { try { await api(`/api/v1/os/costs/${cid}/validate`, { method: 'POST', body: JSON.stringify({ validated: v }) }); load() } catch { say('err', 'Erro.') } }

  const porValidar = costs.filter((c: any) => !c.validated).length

  return (
    <div className="svc-costs">
      <div className="svc-costs-title">
        Custos deste serviço
        {podeGestao && porValidar > 0 && <span className="svc-costs-pend">{porValidar} por validar</span>}
      </div>
      {costs.length === 0 && !novo && <p className="hint" style={{ margin: '4px 0' }}>Sem custos. Acrescenta o que compraste — mão de obra, material, peças.</p>}
      {costs.map((c: any) => (
        <div key={c.id} className={`svc-cost-row ${!c.validated ? 'unvalidated' : ''}`}>
          <div className="svc-cost-info">
            <span className="svc-cost-label">{c.label}
              {!c.validated && <span className="svc-cost-pend-tag">por validar</span>}
            </span>
            <span className="svc-cost-meta">{CAT[c.category]}{c.supplier_dept_name ? ` · fornecido por ${c.supplier_dept_name}` : ''}</span>
          </div>
          <span className="svc-cost-amt">{Number(c.amount).toLocaleString('pt-PT')} MT</span>
          {podeGestao && !c.validated && (
            <button className="svc-cost-ok" onClick={() => validar(c.id, true)} title="Validar"><i className="ti ti-check" aria-hidden="true"></i></button>
          )}
          {podeGestao && c.validated && (
            <button className="svc-cost-okd" onClick={() => validar(c.id, false)} title="Validado — tocar para reverter"><i className="ti ti-circle-check" aria-hidden="true"></i></button>
          )}
          <button className="mdl-edit" onClick={() => remover(c.id)}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>
      ))}
      {novo ? (
        <div className="svc-cost-form">
          <select value={novo.category} onChange={e => setNovo({ ...novo, category: e.target.value })}>
            {Object.keys(CAT).map(k => <option key={k} value={k}>{CAT[k]}</option>)}
          </select>
          <input placeholder="descrição (ex: Filtro de óleo, Mão de obra)" value={novo.label} onChange={e => setNovo({ ...novo, label: e.target.value })} autoFocus />
          <input type="number" inputMode="decimal" placeholder="custo MT" value={novo.amount} onChange={e => setNovo({ ...novo, amount: e.target.value })} />
          {podeGestao && (
            <div className="svc-cost-internal">
              <label className="fl">Fornecido por outro departamento? <span className="opt-tag">cascata</span></label>
              <select value={novo.supplierDepartmentId || ''} onChange={e => setNovo({ ...novo, supplierDepartmentId: e.target.value })}>
                <option value="">Não — é custo direto</option>
                {depts.filter((d: any) => d.id !== ownerDeptId).map((d: any) => <option key={d.id} value={d.id}>Sim — dos {d.name}</option>)}
              </select>
              {novo.supplierDepartmentId && <p className="hint" style={{ marginTop: 4 }}>Este valor vira receita nesse departamento, onde poderá ter os seus próprios custos.</p>}
            </div>
          )}
          <div className="wf-nav" style={{ marginTop: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={busy || !novo.label.trim() || !novo.amount} onClick={criar}>Guardar custo</button>
          </div>
        </div>
      ) : (
        <button className="accomp-add" onClick={() => setNovo({ category: 'labour', label: '', amount: '', supplierDepartmentId: '' })}><i className="ti ti-plus" aria-hidden="true"></i> Acrescentar custo</button>
      )}
    </div>
  )
}

// ── MARCAÇÃO RÁPIDA — a dona lança o mínimo (do WhatsApp) ─────
function QuickBooking({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ customerPhone: '', customerName: '', make: '', model: '', note: '', bookingDate: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  const submeter = async () => {
    if (!f.note.trim()) { setMsg({ kind: 'err', text: 'Diz o que o cliente precisa (a queixa).' }); return }
    if (!f.customerPhone.trim() && !f.customerName.trim()) { setMsg({ kind: 'err', text: 'Preciso do contacto ou do nome — pelo menos um.' }); return }
    setBusy(true); setMsg(null)
    try {
      await api('/api/v1/bookings/quick', { method: 'POST', body: JSON.stringify({
        customerPhone: f.customerPhone || null, customerName: f.customerName || null,
        make: f.make || null, model: f.model || null,
        note: f.note.trim(), bookingDate: f.bookingDate || null,
      }) })
      setMsg({ kind: 'ok', text: 'Marcação lançada. O supervisor vê-a em "Marcações a tratar".' })
      setF({ customerPhone: '', customerName: '', make: '', model: '', note: '', bookingDate: '' })
      setTimeout(onDone, 900)
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Não guardou.' }) }
    finally { setBusy(false) }
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Marcação rápida</h2><span />
      </div>

      <div className="banner i" style={{ marginBottom: 14 }}>
        <span style={{ fontWeight: 700, display: 'block', marginBottom: 3 }}>Só o essencial</span>
        Lança o mínimo do que o cliente disse no WhatsApp. O supervisor recolhe o resto e agenda.
      </div>

      {msg && <div className={`banner ${msg.kind === 'ok' ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="card">
        <label className="fl">Contacto (WhatsApp / telefone)</label>
        <input value={f.customerPhone} onChange={e => setF({ ...f, customerPhone: e.target.value })} placeholder="número do cliente" autoFocus />
        <label className="fl" style={{ marginTop: 10 }}>Nome do cliente (se souberes)</label>
        <input value={f.customerName} onChange={e => setF({ ...f, customerName: e.target.value })} placeholder="opcional" />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="fl">Marca</label>
            <input value={f.make} onChange={e => setF({ ...f, make: e.target.value })} placeholder="ex: Toyota" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="fl">Modelo</label>
            <input value={f.model} onChange={e => setF({ ...f, model: e.target.value })} placeholder="ex: Hilux" />
          </div>
        </div>
        <label className="fl" style={{ marginTop: 10 }}>O que precisa? (a queixa) *</label>
        <textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="ex: barulho na frente, quer remap, revisão…" rows={3} style={{ width: '100%', boxSizing: 'border-box' }} />
        <label className="fl" style={{ marginTop: 10 }}>Quando, se souberes (opcional)</label>
        <input type="datetime-local" value={f.bookingDate} onChange={e => setF({ ...f, bookingDate: e.target.value })} />
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={busy} onClick={submeter}>
          {busy ? 'A lançar…' : 'Lançar marcação'}
        </button>
      </div>
    </main>
  )
}

// ── MARCAÇÕES A TRATAR — o Yury vê e completa ────────────────
function LeadsList({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api('/api/v1/bookings/leads').then(r => setList(r.data || [])).catch(() => {}).finally(() => setLoading(false)) }, [])

  const quando = (d: string) => d ? new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Marcações a tratar</h2><span />
      </div>

      {loading ? <p className="empty">A carregar…</p> : list.length === 0 ? (
        <div className="banner ok">Não há marcações à espera. Tudo tratado.</div>
      ) : (
        <>
          <p className="hint" style={{ margin: '0 4px 12px' }}>Toca numa marcação para recolher o resto da informação e transformá-la numa recepção.</p>
          <div className="prob-list">
            {list.map((l: any) => (
              <button key={l.id} className="card lead-card" onClick={() => onOpen(l.id)} style={{ width: '100%', textAlign: 'left', display: 'block', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div className="avatar" style={{ flexShrink: 0 }}><i className="ti ti-user" aria-hidden="true"></i></div>
                  <div style={{ flex: 1 }}>
                    <div className="h">{l.customer_name || l.customer_phone || 'Cliente'}{l.customer_name && l.customer_phone && <span className="sub" style={{ display: 'inline', marginLeft: 6 }}>· {l.customer_phone}</span>}</div>
                    {(l.booking_make || l.booking_model) && <div className="sub" style={{ marginTop: 1 }}><i className="ti ti-car" aria-hidden="true"></i> {[l.booking_make, l.booking_model].filter(Boolean).join(' ')}</div>}
                    <div style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '4px 0' }}>{l.booking_note}</div>
                    <div className="sub">
                      {quando(l.booking_date) ? <span className="lead-when"><i className="ti ti-calendar-event" aria-hidden="true"></i> {quando(l.booking_date)}</span> : <span style={{ color: 'var(--ink-3)' }}>sem data</span>}
                      {l.created_by_name && <span> · lançou {l.created_by_name}</span>}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0 }}></i>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

// ── PAINEL DO SUPER-ADMIN — criar e gerir oficinas ───────────
function AdminWorkshops({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [criar, setCriar] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [f, setF] = useState<any>({ name: '', slug: '', vatRate: '16', brandColor: '#4F46E5', nuit: '', phone: '', ownerName: '', ownerEmail: '', ownerPassword: '' })

  const load = () => { setLoading(true); api('/api/v1/admin/workshops').then(r => setList(r.data || [])).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(load, [])

  const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const submeter = async () => {
    if (!f.name.trim() || !f.slug.trim() || !f.ownerName.trim() || !f.ownerEmail.trim() || f.ownerPassword.length < 6) {
      setMsg({ kind: 'err', text: 'Preenche todos os campos (password com 6+ caracteres).' }); return
    }
    setBusy(true); setMsg(null)
    try {
      await api('/api/v1/admin/workshops', { method: 'POST', body: JSON.stringify({
        name: f.name.trim(), slug: f.slug.trim(), vatRate: parseFloat(f.vatRate) || 16,
        brandColor: f.brandColor, nuit: f.nuit || null, phone: f.phone || null,
        ownerName: f.ownerName.trim(), ownerEmail: f.ownerEmail.trim(), ownerPassword: f.ownerPassword,
      }) })
      setMsg({ kind: 'ok', text: `Oficina "${f.name}" criada. O dono já pode entrar com o email e password.` })
      setCriar(false); setF({ name: '', slug: '', vatRate: '16', brandColor: '#4F46E5', nuit: '', phone: '', ownerName: '', ownerEmail: '', ownerPassword: '' })
      load()
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Não foi possível criar a oficina.' }) }
    finally { setBusy(false) }
  }

  return (
    <main className="reception">
      <div className="rec-top" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Início</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Oficinas</h2><span />
      </div>

      {msg && <div className={`banner ${msg.kind === 'ok' ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {!criar && (
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} onClick={() => { setCriar(true); setMsg(null) }}>
          <i className="ti ti-plus" aria-hidden="true"></i> Criar oficina nova
        </button>
      )}

      {criar && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="det-section-title" style={{ marginTop: 0 }}>Nova oficina</div>
          <label className="fl">Nome da oficina</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value, slug: f.slug || slugify(e.target.value) })} placeholder="ex: Auto Reparações Silva" />
          <label className="fl" style={{ marginTop: 10 }}>Endereço no sistema (slug)</label>
          <input value={f.slug} onChange={e => setF({ ...f, slug: slugify(e.target.value) })} placeholder="auto-reparacoes-silva" />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="fl">IVA (%)</label>
              <input type="number" value={f.vatRate} onChange={e => setF({ ...f, vatRate: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="fl">Cor da marca</label>
              <input type="color" value={f.brandColor} onChange={e => setF({ ...f, brandColor: e.target.value })} style={{ height: 42, padding: 4 }} />
            </div>
          </div>
          <label className="fl" style={{ marginTop: 10 }}>NUIT (opcional)</label>
          <input value={f.nuit} onChange={e => setF({ ...f, nuit: e.target.value })} placeholder="número de contribuinte" />

          <div className="det-section-title">Dono da oficina</div>
          <label className="fl">Nome</label>
          <input value={f.ownerName} onChange={e => setF({ ...f, ownerName: e.target.value })} placeholder="nome do dono" />
          <label className="fl" style={{ marginTop: 10 }}>Email (para entrar)</label>
          <input type="email" value={f.ownerEmail} onChange={e => setF({ ...f, ownerEmail: e.target.value })} placeholder="dono@oficina.co.mz" />
          <label className="fl" style={{ marginTop: 10 }}>Password inicial</label>
          <input type="text" value={f.ownerPassword} onChange={e => setF({ ...f, ownerPassword: e.target.value })} placeholder="mínimo 6 caracteres — o dono muda depois" />
          <p className="hint" style={{ marginTop: 4 }}>Combina a password com o dono; ele pode alterá-la depois de entrar.</p>

          <div className="wf-nav" style={{ marginTop: 14 }}>
            <button className="btn-ghost" onClick={() => { setCriar(false); setMsg(null) }}>Cancelar</button>
            <button className="btn-primary" disabled={busy} onClick={submeter}>{busy ? 'A criar…' : 'Criar oficina'}</button>
          </div>
        </div>
      )}

      <div className="sec-label" style={{ margin: '4px 4px 8px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Oficinas no sistema</div>
      {loading ? <p className="empty">A carregar…</p> : list.length === 0 ? <p className="empty">Ainda não há oficinas.</p> : (
        <div className="prob-list">
          {list.map((w: any) => (
            <div key={w.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div className="h">{w.name}{!w.active && <span className="stype-off-tag"> inativa</span>}</div>
                  <div className="sub">{w.slug} · {w.users} utilizador{w.users === '1' ? '' : 'es'}{w.owner_name ? ` · ${w.owner_name}` : ''}</div>
                </div>
                <span className="pill i">{w.currency}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function OrderService({ joId, onBack, myId, isOwner, onOpenEntry }: { joId: string; onBack: () => void; myId: string; isOwner: boolean; onOpenEntry?: (id: string) => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [newProblem, setNewProblem] = useState('')
  const [notes, setNotes] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [photoView, setPhotoView] = useState<string | null>(null)
  const [budget, setBudget] = useState<any>(null)
  const podePreco = useSession(s => s.can)('pricing:manage')

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
  const loadBudget = () => { if (podePreco) api(`/api/v1/os/${joId}/budget`).then(setBudget).catch(() => {}) }
  useEffect(() => { loadBudget() }, [joId, podePreco])

  const startOS = async () => {
    setStarting(true)
    try { await api(`/api/v1/os/start/${joId}`, { method: 'POST' }); load() }
    catch (e: any) { say('err', e?.message || 'Não foi possível iniciar a OS.') }
    finally { setStarting(false) }
  }

  const jo = data?.jo
  const problems = data?.problems || []
  const isDiag = jo?.status === 'in_diagnosis'
  // Resumo do progresso dos serviços — informa a fase do carro sem a
  // controlar. Só conta o que não foi dispensado ("não feito").
  const svcs = (data?.services || []).filter((s: any) => s.status !== 'not_done')
  const svcDone = svcs.filter((s: any) => s.status === 'done').length
  const svcWaiting = svcs.filter((s: any) => ['awaiting_part', 'awaiting_approval', 'on_hold'].includes(s.status)).length
  const todosProntos = svcs.length > 0 && svcDone === svcs.length
  const jaMarcadoPronto = ['ready', 'delivered'].includes(jo?.status)
  const [acting, setActing] = useState(false)      // trava toques repetidos em 3G
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [ask, setAsk] = useState<{ text: string; detail?: string; danger?: boolean; yes?: string; needsReason?: boolean; reasonPlaceholder?: string; run: (reason?: string) => void } | null>(null)
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
  const toService = async (p: any) => {
    if (acting) return
    setActing(true)
    try {
      await api(`/api/v1/os/problems/${p.id}/to-service`, { method: 'POST', body: JSON.stringify({}) })
      say('ok', 'Passou para a lista de serviços a fazer.')
      await load()
    } catch (e: any) { say('err', e?.message || 'Não foi possível criar o serviço.') }
    finally { setActing(false) }
  }
  const dismissProblem = (pid: string) => {
    setAsk({
      text: 'Porque é que não se faz?', danger: false, yes: 'Dispensar',
      needsReason: true, reasonPlaceholder: 'ex: cliente não quer / não é necessário / adiado',
      run: async (reason?: string) => {
        setActing(true)
        try { await api(`/api/v1/os/problems/${pid}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) }); await load() }
        catch (e: any) { say('err', e?.message || 'Não foi possível dispensar.') }
        finally { setActing(false) }
      },
    })
  }
  const reopenProblem = async (pid: string) => {
    try { await api(`/api/v1/os/problems/${pid}/reopen`, { method: 'POST' }); await load() }
    catch (e: any) { say('err', e?.message || 'Não foi possível reabrir.') }
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
    try { await api(`/api/v1/os/${joId}/authorize-diagnosis`, { method: 'POST', body: JSON.stringify({ approve: true }) }); setShowAuth(false); load(); say('ok', 'Diagnóstico autorizado.') }
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
      <ConfirmBox ask={ask} onNo={() => setAsk(null)} onYes={(reason?: string) => { const r = ask?.run; setAsk(null); r?.(reason) }} />

      <div className="os-status-bar">
        <span className="os-veh">{jo.brand} {jo.model} · {jo.plate}</span>
        <span className={`os-badge st-${jo.status}`}>
          {jo.status === 'in_diagnosis' ? 'Em diagnóstico' : jo.status === 'diagnosis_review' ? 'Aguarda autorização' : jo.status === 'awaiting_quote' ? 'Diagnóstico concluído' : jo.status}
        </span>
      </div>

      {svcs.length > 0 && (
        <div className="os-progress">
          <div className="os-progress-bar">
            <div className="os-progress-fill" style={{ width: `${Math.round((svcDone / svcs.length) * 100)}%` }} />
          </div>
          <div className="os-progress-txt">
            <strong>{svcDone} de {svcs.length}</strong> {svcs.length === 1 ? 'serviço concluído' : 'serviços concluídos'}
            {svcWaiting > 0 && <span className="os-progress-wait"> · {svcWaiting} à espera</span>}
          </div>
        </div>
      )}

      {todosProntos && !jaMarcadoPronto && (
        <div className="os-ready-hint">
          <div><i className="ti ti-circle-check" aria-hidden="true"></i> Todos os serviços estão concluídos. O carro pode estar pronto para entrega.</div>
          <button className="btn-primary btn-sm" onClick={async () => {
            try { await api(`/api/v1/os/${jo.id}/mark-ready`, { method: 'POST' }); load(); say('ok', 'Carro marcado como pronto.') }
            catch (e: any) { say('err', e?.message || 'Não foi possível marcar como pronto.') }
          }}>Marcar como pronto</button>
        </div>
      )}

      <div className="os-responsible">
        <i className="ti ti-user-star" aria-hidden="true"></i>
        <span className="os-resp-label">Responsável:</span>
        <select value={jo.responsible_id || ''} onChange={async e => {
          try { await api(`/api/v1/os/${jo.id}/responsible`, { method: 'POST', body: JSON.stringify({ userId: e.target.value || null }) }); load() }
          catch { say('err', 'Não foi possível definir o responsável.') }
        }}>
          <option value="">— ninguém —</option>
          {(data?.team || []).map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>

      {['ready', 'quality_check'].includes(jo.status) && (
        <QCPanel joId={jo.id} say={say} onDelivered={load} />
      )}

      {jo.diag_rejected_note && isDiag && (
        <div className="os-reject-note"><i className="ti ti-alert-triangle" aria-hidden="true"></i> Diagnóstico devolvido: {jo.diag_rejected_note}</div>
      )}

      <div className="det-section-title" style={{ marginTop: 18 }}>Serviços deste carro</div>
      <div className="svc-list">
        {(data?.services || []).length === 0 && <p className="hint">Sem serviços registados.</p>}
        {(data?.services || []).map((s: any) => (
          <ServiceRow key={s.id} svc={s} onChanged={() => { load(); loadBudget() }} say={say} team={data?.team || []} responsibleId={jo.responsible_id} />
        ))}
      </div>

      {podePreco && budget && (budget.precoCliente > 0 || (budget.porDepartamento || []).length > 0) && (
        <div className="budget-box">
          <div className="budget-title"><i className="ti ti-report-money" aria-hidden="true"></i> Margem por departamento</div>
          <div className="budget-head-row">
            <span className="bh-dept"></span>
            <span className="bh-col">Receita</span>
            <span className="bh-col">Custo</span>
            <span className="bh-col">Margem</span>
          </div>
          {(budget.porDepartamento || []).map((d: any) => (
            <div key={d.id} className="budget-drow">
              <span className="bd-dept">{d.name}</span>
              <span className="bd-col">{Number(d.receita).toLocaleString('pt-PT')}</span>
              <span className="bd-col cost">{Number(d.custo).toLocaleString('pt-PT')}</span>
              <span className={`bd-col margin ${d.margem < 0 ? 'neg' : ''}`}>{Number(d.margem).toLocaleString('pt-PT')}</span>
            </div>
          ))}
          <div className="budget-drow tot">
            <span className="bd-dept">Total</span>
            <span className="bd-col"></span>
            <span className="bd-col"></span>
            <span className={`bd-col margin ${budget.margemTotal < 0 ? 'neg' : ''}`}>{Number(budget.margemTotal || 0).toLocaleString('pt-PT')}</span>
          </div>
          <div className="budget-client">
            <span>O cliente paga (sem IVA)</span>
            <span className="budget-client-val">{Number(budget.precoCliente || 0).toLocaleString('pt-PT')} MT</span>
          </div>
        </div>
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

            {/* Decisão: o que fazer com este achado */}
            {p.status === 'converted' ? (
              <div className="prob-decided ok"><i className="ti ti-arrow-right" aria-hidden="true"></i> Virou serviço: {p.service_name}</div>
            ) : p.status === 'dismissed' ? (
              <div className="prob-decided no">
                <div><i className="ti ti-ban" aria-hidden="true"></i> Dispensado: {p.dismiss_reason}</div>
                <button className="prob-undo" onClick={() => reopenProblem(p.id)}>Reabrir</button>
              </div>
            ) : (
              <div className="prob-decide">
                <button className="btn-primary btn-sm" onClick={() => toService(p)}>
                  <i className="ti ti-tool" aria-hidden="true"></i> Transformar em serviço
                </button>
                <button className="btn-ghost btn-sm" onClick={() => dismissProblem(p.id)}>
                  <i className="ti ti-ban" aria-hidden="true"></i> Não fazer
                </button>
              </div>
            )}
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
                Ao autorizar, assumo a responsabilidade técnica partilhada por este diagnóstico, nos termos das minhas funções. Fica registado que foi você, com a data e a hora.
              </div>
              <div className="rec-nav" style={{ marginTop: 14 }}>
                <button className="btn-ghost" onClick={() => setShowAuth(false)}>Voltar</button>
                <button className="btn-primary" onClick={authorize}>Autorizar diagnóstico</button>
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
            if (!confirm(`Marcar ${jo.number} como finalizada/entregue?\n\nAtalho temporário para fechar carros já tratados enquanto o ciclo completo não está pronto. Ignora o controlo de qualidade — usar só em testes.`)) return
            try { await api(`/api/v1/receptions/${joId}/status`, { method: 'POST', body: JSON.stringify({ status: 'delivered', force: true }) }); load() }
            catch (e: any) { alert(e?.message || 'Não foi possível finalizar.') }
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
// ══ PÁGINA PÚBLICA do relatório PPI (sem login) ══════════════
// Site read-only, bonito, acessível por link. Só dados seguros —
// estado do carro e fotos, nunca dados do cliente. Marca discreta
// da plataforma no rodapé.
function PublicReport({ token }: { token: string }) {
  const [data, setData] = useState<any>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'expired' | 'error'>('loading')

  useEffect(() => {
    const base = (import.meta as any).env?.VITE_API_URL || ''
    fetch(`${base}/api/v1/public/ppi/${token}`)
      .then(async r => {
        if (r.status === 410) { setState('expired'); return null }
        if (!r.ok) { setState('error'); return null }
        return r.json()
      })
      .then(d => { if (d) { setData(d); setState('ok') } })
      .catch(() => setState('error'))
  }, [token])

  const nivel = (l: string) => l === 'basic' ? 'Básico' : l === 'standard' ? 'Standard' : 'Premium'
  const stLabel: Record<string, string> = { bom: 'Bom', aceitavel: 'Aceitável', mau: 'Mau', na: 'N.A.' }
  const stCls: Record<string, string> = { bom: 'pr-bom', aceitavel: 'pr-acc', mau: 'pr-mau', na: 'pr-na' }

  if (state === 'loading') return <div className="pr-wrap"><div className="pr-center">A carregar relatório…</div></div>
  if (state === 'expired') return <div className="pr-wrap"><div className="pr-center"><i className="ti ti-clock-off" aria-hidden="true" style={{ fontSize: 40, color: '#9CA3AF' }}></i><h2>Este link expirou</h2><p>O relatório já não está disponível. Contacta a oficina para um novo acesso.</p></div></div>
  if (state === 'error' || !data) return <div className="pr-wrap"><div className="pr-center"><i className="ti ti-alert-circle" aria-hidden="true" style={{ fontSize: 40, color: '#DC2626' }}></i><h2>Relatório não encontrado</h2><p>O link pode estar incorreto.</p></div></div>

  const brand = data.tenant?.brand || '#1B7A3D'
  const v = data.vehicle

  return (
    <div className="pr-wrap" style={{ ['--pr-brand' as any]: brand }}>
      <header className="pr-header">
        {data.tenant?.logo && <img src={data.tenant.logo} alt="" className="pr-logo" />}
        <div className="pr-tenant">{data.tenant?.name || 'Oficina'}</div>
        <div className="pr-sub">Relatório de Inspeção Pré-Compra</div>
      </header>

      <div className="pr-card pr-hero">
        <div className="pr-plate">{v.plate}</div>
        <div className="pr-veh">{v.brand} {v.model} {v.year ? `· ${v.year}` : ''}</div>
        <div className="pr-meta">
          <span className="pr-badge">PPI {nivel(data.level)}</span>
          {v.km != null && <span className="pr-km">{v.km} km</span>}
          <span className="pr-date">{data.date ? new Date(data.date).toLocaleDateString('pt-PT') : ''}</span>
        </div>
      </div>

      {data.sections.map((sec: any, i: number) => (
        <div key={i} className="pr-card">
          <h3 className="pr-sec">{sec.name}</h3>
          {sec.points.map((pt: any, j: number) => (
            <div key={j} className="pr-point">
              <div className="pr-point-name">{pt.name}</div>
              <div className="pr-fields">
                {pt.respostas.map((r: any, k: number) => (
                  <div key={k} className="pr-field">
                    <span className="pr-flabel">{r.label}{r.unit ? ` (${r.unit})` : ''}</span>
                    <span className="pr-fval">
                      {r.state && <span className={`pr-state ${stCls[r.state]}`}>{stLabel[r.state]}</span>}
                      {r.number != null && <span>{r.number}{r.unit ? ` ${r.unit}` : ''}</span>}
                      {r.text && <span>{r.text}</span>}
                      {r.url && (r.type === 'file'
                        ? <a href={r.url} target="_blank" rel="noreferrer" className="pr-link">Ver ficheiro</a>
                        : <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt="" className="pr-photo" /></a>)}
                      {(r.extras || []).filter(Boolean).map((ex: string, n: number) => (
                        r.type === 'file'
                          ? <a key={n} href={ex} target="_blank" rel="noreferrer" className="pr-link">Ficheiro {n + 2}</a>
                          : <a key={n} href={ex} target="_blank" rel="noreferrer"><img src={ex} alt="" className="pr-photo" /></a>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="pr-disclaimer">
        Este relatório reflete a condição do veículo no momento da inspeção, com base nas condições observáveis e no equipamento disponível. Não garante a deteção de defeitos ocultos nem constitui recomendação de compra.
      </div>
      <footer className="pr-footer">
        <div className="pr-by">Inspeção realizada por <b>{data.tenant?.name}</b></div>
        <div className="pr-promo">
          <div className="pr-promo-brand">OficinaHub</div>
          <div className="pr-promo-txt">Este relatório foi feito com o OficinaHub — a plataforma que ajuda oficinas a inspecionar, registar e entregar trabalho com rasto de tudo.</div>
          <div className="pr-promo-cta">Tem uma oficina? Fale connosco.</div>
        </div>
      </footer>
    </div>
  )
}

function App() {
  const token = useSession(s => s.accessToken)
  const checkTimeout = useSession(s => s.checkTimeout)
  const touch = useSession(s => s.touch)

  const publicMatch = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)/)

  useEffect(() => {
    if (publicMatch) return   // página pública não precisa de timeout de sessão
    checkTimeout()
    const iv = setInterval(() => checkTimeout(), 60 * 1000)
    const onActivity = () => touch()
    const events = ['click', 'keydown', 'touchstart', 'visibilitychange']
    events.forEach(e => window.addEventListener(e, onActivity))
    return () => { clearInterval(iv); events.forEach(e => window.removeEventListener(e, onActivity)) }
  }, [])

  // Página pública do relatório PPI — sem autenticação. URL: /r/<token>.
  if (publicMatch) return <PublicReport token={publicMatch[1]} />
  return token ? <Shell /> : <Login />
}
createRoot(document.getElementById('root')!).render(<App />)
