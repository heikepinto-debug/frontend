// ============================================================
// OFICINAHUB — App principal
// Login = marca OficinaHub · Após login = marca do tenant
// Recepção blindada: câmara real, GPS real, assinatura, offline
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { useSession } from './session'
import { api, offline, uploadPhoto, startAutoSync } from './api'
import './styles.css'

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
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/auth/login`, {
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
  const [view, setView] = useState<'home' | 'reception' | 'list' | 'tasks' | 'detail' | 'bookings' | 'os'>('home')
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [osId, setOsId] = useState<string | undefined>(undefined)
  const [bookingCount, setBookingCount] = useState(0)
  const isOwner = canDo('jobdelete:any')

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    startAutoSync(() => offline.pendingCount().then(setPending))
    const t = setInterval(() => offline.pendingCount().then(setPending), 5000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [])

  // Contador de marcações (hoje + em atraso) — actualiza ao voltar ao início
  useEffect(() => {
    if (view === 'home') {
      api('/api/v1/bookings').then(r => {
        const now = new Date(); now.setHours(23, 59, 59, 999)
        const relevant = (r.data || []).filter((b: any) => new Date(b.booking_date) <= now)
        setBookingCount(relevant.length)
      }).catch(() => {})
    }
  }, [view])

  return (
    <div className="shell">
      <header className="tenant-header">
        {tenant?.logoUrl
          ? <img src={tenant.logoUrl} alt="" className="tenant-logo" />
          : <div className="tenant-logo-fallback">{tenant?.name?.[0]}</div>}
        <div>
          <div className="tenant-name">{tenant?.name}</div>
          <div className="tenant-powered">powered by OficinaHub</div>
        </div>
        <div className="header-right">
          {!online && <span className="offline-pill">Offline{pending > 0 ? ` · ${pending}` : ''}</span>}
          {online && pending > 0 && <span className="sync-pill">A sincronizar {pending}…</span>}
          <span className="user-name">{user?.name}</span>
          <button className="btn-ghost btn-sm" onClick={logout}>Sair</button>
        </div>
      </header>

      {view === 'home' && (
        <main className="home home-bg">
          <h1>Olá, {user?.name?.split(' ')[0]}</h1>
          <div className="home-actions">
            <button className="action-card" onClick={() => { setResumeDraftId(undefined); setView('reception') }}>
              <div className="action-ic"><i className="ti ti-car" aria-hidden="true"></i></div>
              <span className="action-title">Nova recepção</span>
              <span className="action-sub">Cliente, viatura, fotos e assinatura</span>
            </button>
            <button className="action-card" onClick={() => setView('list')}>
              <div className="action-ic"><i className="ti ti-list-details" aria-hidden="true"></i></div>
              <span className="action-title">Recepções</span>
              <span className="action-sub">Ver ordens de trabalho criadas</span>
            </button>
            <button className="action-card" onClick={() => setView('bookings')}>
              <div className="action-ic"><i className="ti ti-calendar-event" aria-hidden="true"></i>{bookingCount > 0 && <span className="card-badge">{bookingCount}</span>}</div>
              <span className="action-title">Marcações</span>
              <span className="action-sub">{bookingCount > 0 ? `${bookingCount} para hoje ou em atraso` : 'Agenda de veículos marcados'}</span>
            </button>
            <button className="action-card" onClick={() => setView('tasks')}>
              <div className="action-ic"><i className="ti ti-checklist" aria-hidden="true"></i></div>
              <span className="action-title">Tarefas</span>
              <span className="action-sub">As minhas tarefas e as que atribuí</span>
            </button>
          </div>
        </main>
      )}
      {view === 'reception' && <Reception key={resumeDraftId || 'new'} resumeDraftId={resumeDraftId} onDone={() => { setResumeDraftId(undefined); setView('list') }} onBack={() => { setResumeDraftId(undefined); setView('home') }} />}
      {view === 'list' && <ReceptionList onBack={() => setView('home')} onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} onOpen={(id: string) => { setDetailId(id); setView('detail') }} isOwner={isOwner} onOpenOS={(id: string) => { setOsId(id); setView('os') }} />}
      {view === 'detail' && detailId && <ReceptionDetail joId={detailId} onBack={() => setView('list')} onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} isOwner={isOwner} />}
      {view === 'bookings' && <Bookings onBack={() => setView('home')} onResume={(id: string) => { setResumeDraftId(id); setView('reception') }} />}
      {view === 'os' && osId && <OrderService joId={osId} onBack={() => setView('list')} myId={user?.id || ''} isOwner={isOwner} />}
      {view === 'tasks' && <Tasks onBack={() => setView('home')} isOwner={isOwner} myId={user?.id || ''} />}
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


function Reception({ onDone, onBack, resumeDraftId }: { onDone: () => void; onBack: () => void; resumeDraftId?: string }) {
  const tenant = useSession(s => s.tenant)
  const [step, setStep] = useState(0)
  const [units, setUnits] = useState<any[]>([])
  const [terms, setTerms] = useState<any>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [draftId, setDraftId] = useState<string | null>(resumeDraftId || null)
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

  const [intentions, setIntentions] = useState<string[]>([])   // intenções múltiplas do cliente
  const [intentInput, setIntentInput] = useState('')
  const [svcDesc, setSvcDesc] = useState('')
  const [unitId, setUnitId] = useState('')
  const [services, setServices] = useState<any[]>([])          // catálogo, só p/ sugestões

  const [km, setKm] = useState(''); const [fuel, setFuel] = useState(2)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [valuables, setValuables] = useState('')
  const [batteryRef, setBatteryRef] = useState('')                           // referência da bateria
  const [systemsCheck, setSystemsCheck] = useState<Record<string, string>>({})  // sistema → ok/fail/untested
  const [wantsOldParts, setWantsOldParts] = useState<boolean | null>(null)   // quer as peças antigas
  const [showDiagNotice, setShowDiagNotice] = useState(false)                // pop-up do dever de diagnóstico
  const [remapAccepted, setRemapAccepted] = useState(false)                  // cliente aceitou o aviso de remap/dyno

  const [damages, setDamages] = useState<Damage[]>([])
  const [dmgGroup, setDmgGroup] = useState(0)

  const [photos, setPhotos] = useState<Record<string, Blob>>({})
  const [idDoc, setIdDoc] = useState<Blob | null>(null)   // foto do documento de identificação

  const [handedOff, setHandedOff] = useState(false)       // colaborador entregou o tablet ao cliente
  const [reviewed, setReviewed] = useState(false)         // cliente reviu o resumo
  const [tc, setTc] = useState([false, false, false])
  const [sigData, setSigData] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ number: string; offline: boolean; joId?: string; draft?: boolean } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const pendingZone = useRef<string>('')

  useEffect(() => {
    api('/api/v1/business-units').then(r => { setUnits(r.data); if (r.data[0]) setUnitId(r.data[0].id) }).catch(() => {})
    api('/api/v1/terms/active').then(setTerms).catch(() => {})
    // Pop-up do dever de diagnóstico (se ligado) — só numa entrada nova, não ao retomar rascunho
    if (!resumeDraftId) {
      api('/api/v1/reception-config').then(r => { if (r.diagnosisNoticeOn) setShowDiagNotice(true) }).catch(() => {})
    }
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true, timeout: 8000 })
  }, [])

  // Retomar rascunho: carrega e preenche os campos
  useEffect(() => {
    if (!resumeDraftId) return
    api(`/api/v1/receptions/${resumeDraftId}/draft`).then(({ data: d }) => {
      setExistingCust({ id: d.customer_id, full_name: d.customer_name, phone: d.customer_phone })
      setExistingVeh({ id: d.vehicle_id, plate: d.plate, brand: d.brand, model: d.model, year: d.year })
      setKm(d.km_entry != null ? String(d.km_entry) : '')
      setFuel(d.fuel_level ?? 2)
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
    }).catch(() => {})
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
        : { plate: plate.toUpperCase(), brand, model, year: vyear ? Number(vyear) : undefined },
      kmEntry: km ? Number(km) : undefined, fuelLevel: fuel,
      declaredValuables: valuables || undefined,
      checklist, damageZones: damages.map(d => ({ id: d.id, area: d.area, note: d.note })),
      batteryReference: batteryRef || undefined, systemsCheck,
      wantsOldParts: wantsOldParts ?? undefined,
      intentions, serviceDescription: svcDesc || undefined,
      bookingDate: bookingDate || undefined,
    }
    try {
      const r = await api('/api/v1/receptions/draft', { method: 'POST', body: JSON.stringify(payload) })
      setDraftId(r.id)
      setResult({ number: r.number, offline: false, draft: true } as any)
    } catch { alert('Não foi possível guardar o rascunho.') }
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

  const reqCount = REQ_ZONES.filter(z => photos[z.key]).length
  const wheelCount = WHEEL_ZONES.filter(z => photos[z.key]).length
  const batteryCount = photos[BATTERY_ZONE.key] ? 1 : 0
  const dashCount = DASH_ZONES.filter(z => photos[z.key]).length
  const totalReq = reqCount + wheelCount + batteryCount + dashCount
  const allTc = tc.every(Boolean)
  // Detecta se o serviço envolve remap ou dyno (para o aviso específico)
  const isRemapDyno = intentions.some(i => /remap|reprogram|dyno|tune|tuning|stage|potência|potencia|mapa/i.test(i))

  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!existingCust || (newCust && custName.trim().length >= 2 && V.phone(custPhone) && V.email(custEmail))
      case 1: return !!existingVeh || (V.plate(plate) && V.year(vyear))
      case 2: return intentions.length >= 1
      case 3: return valuables.trim().length > 0 && V.km(km)
      case 4: return true                       // danos são opcionais
      case 5: return totalReq >= REQ_TOTAL && batteryRef.trim().length > 0  // fotos + referência da bateria
      case 6: return allTc && !!sigData && (!!existingCust || !!idDoc) && (!isRemapDyno || remapAccepted)  // BI + aviso remap
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
        : { plate: plate.toUpperCase(), brand, model, year: vyear ? Number(vyear) : undefined },
      kmEntry: Number(km), fuelLevel: fuel,
      declaredValuables: valuables || 'Nenhum objecto declarado',
      checklist,
      damageZones: damages.map(d => ({ id: d.id, area: d.area, note: d.note })),
      batteryReference: batteryRef || undefined, systemsCheck,
      wantsOldParts: wantsOldParts ?? undefined,
      intentions, serviceDescription: svcDesc || undefined,
      bookingDate: bookingDate || undefined,
      termsVersion: terms?.version || '1.0',
      termsAcceptedAt: new Date().toISOString(),
    }
    const allReq = [...REQ_ZONES, ...WHEEL_ZONES, BATTERY_ZONE, ...DASH_ZONES]   // 14 fotos obrigatórias
    try {
      if (!navigator.onLine) throw new Error('OFFLINE')
      const jo = await api('/api/v1/receptions', { method: 'POST', body: JSON.stringify(payload) })
      for (const z of allReq)
        if (photos[z.key]) await uploadPhoto(jo.id, z.key, photos[z.key], { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      for (const d of damages)
        if (d.photo) await uploadPhoto(jo.id, `damage-${d.id}`, d.photo, { latitude: gps?.lat, longitude: gps?.lng })
      if (idDoc) {
        const b64 = await blobToBase64(idDoc)
        await api(`/api/v1/receptions/${jo.id}/id-document`, {
          method: 'POST', body: JSON.stringify({ imageBase64: b64 }),
        })
      }
      if (sigData) await api(`/api/v1/receptions/${jo.id}/sign`, {
        method: 'POST', body: JSON.stringify({ signatureBase64: sigData.split(',')[1] }),
      })
      setResult({ number: jo.number, offline: false, joId: jo.id })
    } catch {
      const offlineId = await offline.enqueueReception(payload)
      for (const z of allReq)
        if (photos[z.key]) await offline.savePhotoBlob(offlineId, z.key, photos[z.key], { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      for (const d of damages)
        if (d.photo) await offline.savePhotoBlob(offlineId, `damage-${d.id}`, d.photo, {})
      if (idDoc) await offline.savePhotoBlob(offlineId, 'id-document', idDoc, {})
      setResult({ number: 'Pendente (offline)', offline: true })
    } finally { setBusy(false) }
  }

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
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep(1)}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
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
              <div style={{ marginTop: 14, maxWidth: 160 }}><label className="fl">Ano</label>
                <input type="number" value={vyear} onChange={e => setVyear(e.target.value)} placeholder="2020" />
                {!V.year(vyear) && <div className="field-warn">Ano inválido.</div>}</div>
            </>
          )}
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(0)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep(2)}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 3 — INTENÇÃO DO CLIENTE (fluida, múltipla) */}
      {step === 2 && (
        <section>
          <h2>O que traz o cliente</h2>
          <p className="lead">Escreve tudo o que o cliente pediu ou relatou. Podes adicionar vários. O serviço a executar define-se depois, no diagnóstico.</p>

          <label className="fl">Intenção do cliente <span className="req">*</span></label>
          <div className="intent-input-row">
            <input value={intentInput}
              onChange={e => setIntentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIntention(intentInput) } }}
              placeholder="ex: barulho na frente, quer Stage 2, revisão…" list="svc-suggest" />
            <datalist id="svc-suggest">
              {services.map(s => <option key={s.id} value={s.name} />)}
            </datalist>
            <button className="btn-primary" disabled={!intentInput.trim()} onClick={() => addIntention(intentInput)} style={{ padding: '12px 16px' }}>
              <i className="ti ti-plus" aria-hidden="true"></i>
            </button>
          </div>

          {services.length > 0 && (
            <div className="intent-suggest">
              {services.slice(0, 8).map(s => (
                <button key={s.id} className="intent-chip-suggest" onClick={() => addIntention(s.name)}>
                  <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true"></i>{s.name}
                </button>
              ))}
            </div>
          )}

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
            <button className="btn-ghost" onClick={() => setStep(1)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep(3)}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 4 — ESTADO */}
      {step === 3 && (
        <section>
          <h2>Estado à entrada</h2>
          <p className="lead">Quilometragem, combustível e o que vem com o carro.</p>
          <div className="grid2">
            <div><label className="fl">Km actuais <span className="req">*</span></label>
              <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} placeholder="ex: 87340" /></div>
            <div><label className="fl">Combustível — {Math.round(fuel / 8 * 100)}%</label>
              <div className="fuel-segs">
                {Array.from({ length: 8 }).map((_, i) => <button key={i} className={`fs ${i < fuel ? 'on' : ''}`} onClick={() => setFuel(i + 1)} />)}
              </div></div>
          </div>
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

          <label className="fl" style={{ marginTop: 22 }}>Peças antigas</label>
          <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>O cliente quer ficar com as peças que forem substituídas?</p>
          <div className="seg">
            <button className={wantsOldParts === true ? 'on' : ''} onClick={() => setWantsOldParts(true)}>Sim, quer as peças</button>
            <button className={wantsOldParts === false ? 'on' : ''} onClick={() => setWantsOldParts(false)}>Não quer</button>
          </div>

          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(2)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep(4)}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
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
                  <button className={`dmg-photo ${d.photo ? 'filled' : ''}`} onClick={() => takePhoto(`__dmg__${d.id}`)}>
                    {d.photo ? <img src={URL.createObjectURL(d.photo)} alt="" />
                      : <><i className="ti ti-camera" style={{ fontSize: 16 }} aria-hidden="true"></i>Foto</>}
                  </button>
                  <span className="dmg-x" onClick={() => removeDamage(d.id)}><i className="ti ti-x" aria-hidden="true"></i></span>
                </div>
              ))}
            </div>
          )}
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(3)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="dmg-count">{damages.length === 0 ? 'Sem danos' : `${damages.length} dano${damages.length === 1 ? '' : 's'}`}</span>
              <button className="btn-primary" onClick={() => setStep(5)}>{damages.length === 0 ? 'Sem danos, continuar' : 'Continuar'} <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
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
              <button key={z.key} className={`photo-slot ${photos[z.key] ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {photos[z.key] ? <img src={URL.createObjectURL(photos[z.key])} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span>{z.label}</span>
              </button>
            ))}
          </div>

          <label className="fl" style={{ marginTop: 18 }}>Rodas — porcas em detalhe</label>
          <div className="photo-grid">
            {WHEEL_ZONES.map(z => (
              <button key={z.key} className={`photo-slot ${photos[z.key] ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {photos[z.key] ? <img src={URL.createObjectURL(photos[z.key])} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span>{z.label}</span>
              </button>
            ))}
          </div>

          <label className="fl" style={{ marginTop: 18 }}>Bateria</label>
          <div className="grid2" style={{ alignItems: 'start' }}>
            <button className={`photo-slot ${photos[BATTERY_ZONE.key] ? 'done' : ''}`} onClick={() => takePhoto(BATTERY_ZONE.key)}>
              {photos[BATTERY_ZONE.key] ? <img src={URL.createObjectURL(photos[BATTERY_ZONE.key])} alt="bateria" /> : <span className="photo-icon"><i className="ti ti-battery" aria-hidden="true"></i></span>}
              <span>{BATTERY_ZONE.label}</span>
            </button>
            <div>
              <label className="fl">Referência / marca <span className="req">*</span></label>
              <input value={batteryRef} onChange={e => setBatteryRef(e.target.value)} placeholder="ex: Bosch S4 60Ah" />
              <p className="hint" style={{ marginTop: 6 }}>Protege contra troca de bateria.</p>
            </div>
          </div>

          <label className="fl" style={{ marginTop: 18 }}>Painel e conta-km</label>
          <div className="dash-grid">
            {DASH_ZONES.map(z => (
              <button key={z.key} className={`photo-slot dash ${photos[z.key] ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {photos[z.key] ? <img src={URL.createObjectURL(photos[z.key])} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span className="dash-label">{z.label}</span>
                {!photos[z.key] && <span className="dash-hint">{z.hint}</span>}
              </button>
            ))}
          </div>

          <div className={`count-bar ${totalReq >= REQ_TOTAL ? 'ok' : 'bad'}`}>
            <i className={`ti ${totalReq >= REQ_TOTAL ? 'ti-circle-check' : 'ti-alert-triangle'}`} aria-hidden="true"></i>
            {totalReq} de {REQ_TOTAL} fotos {totalReq >= REQ_TOTAL ? '— completo' : `— faltam ${REQ_TOTAL - totalReq}`}
          </div>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(4)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep(6)}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
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
          <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setStep(5)}>
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

          {newCust && !existingCust && (
            <>
              <label className="fl" style={{ marginTop: 14 }}>Documento de identificação <span className="req">*</span></label>
              <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Foto do BI, passaporte ou carta do cliente — confirma a identidade de quem assina.</p>
              <button className={`photo-slot km ${idDoc ? 'done' : ''}`} onClick={() => takePhoto('__iddoc__')}>
                {idDoc ? <img src={URL.createObjectURL(idDoc)} alt="documento" /> : <span className="photo-icon"><i className="ti ti-id" aria-hidden="true"></i></span>}
                <span>Documento</span>
              </button>
            </>
          )}
          <label className="fl" style={{ marginTop: 14 }}>Assinatura do cliente <span className="req">*</span></label>
          <SignaturePad onChange={setSigData} />
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setReviewed(false)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext() || busy} onClick={submit}>
              {busy ? 'A finalizar…' : <>Finalizar <i className="ti ti-check" aria-hidden="true"></i></>}
            </button>
          </div>
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
  awaiting_quote: 'Aguarda orçamento',
  quote_sent: 'Orçamento enviado',
  approved: 'Aprovado',
  in_progress: 'Em execução',
  quality_check: 'Controlo de qualidade',
  ready: 'Pronto para levantar',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

function ReceptionList({ onBack, onResume, onOpen, isOwner, onOpenOS }: { onBack: () => void; onResume: (id: string) => void; onOpen: (id: string) => void; isOwner: boolean; onOpenOS?: (id: string) => void }) {
  const canDelete = useSession(s => s.can('jobdelete:any'))
  const canStatus = useSession(s => s.can('jobdelete:any'))   // mudar estado: só dono, nesta fase
  const [rows, setRows] = useState<any[]>([])
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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

      <div className="list">
        {rows.map(r => {
          const isDraft = r.status === 'draft'
          return (
            <div key={r.id} className={`list-row clickable ${isDraft ? 'is-draft' : ''}`}>
              <span className="jo-num" onClick={() => onOpen(r.id)}>{r.number}</span>
              <span className="plate" onClick={() => onOpen(r.id)}>{r.plate}</span>
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => onOpen(r.id)}>
                <div className="list-name">{r.customer_name}
                  {(r.priority_level === 'urgent' || r.priority_level === 'high') && <span className={`list-prio p-${r.priority_level}`}>{r.priority_level === 'urgent' ? 'URGENTE' : 'ALTA'}</span>}
                </div>
                <div className="list-sub">{r.brand} {r.model}{isDraft ? '' : ` · ${r.photo_count} fotos${r.signed_at ? ' · assinada' : ''}`}</div>
              </div>
              {isDraft
                ? <span className="badge-draft"><i className="ti ti-device-floppy" aria-hidden="true"></i> Rascunho</span>
                : r.deletion_status === 'pending'
                  ? <span className="badge-del"><i className="ti ti-trash-x" aria-hidden="true"></i> Elim. pendente</span>
                  : <span className={`status s-${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span>}
              {isDraft && (
                <button className="btn-primary btn-sm" onClick={() => onResume(r.id)} title="Continuar lançamento">
                  Continuar <i className="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              )}
              {!isDraft && r.signed_at && onOpenOS && (
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
          )
        })}
        {!loading && rows.length === 0 && <p className="empty">{search ? 'Nada encontrado para essa pesquisa.' : 'Ainda sem recepções.'}</p>}
      </div>
    </main>
  )
}

// ── DETALHE DA RECEPÇÃO (ver informação registada) ───────────
function ReceptionDetail({ joId, onBack, onResume, isOwner }: { joId: string; onBack: () => void; onResume: (id: string) => void; isOwner: boolean }) {
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
        {jo.booking_date && <Row label="Marcação" value={fmt(jo.booking_date)} />}
        {jo.received_at && !isDraft && <Row label="Entrada" value={fmt(jo.received_at)} />}
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
        <Row label="Quilometragem" value={jo.km_entry != null ? `${MZmt(jo.km_entry)} km` : '—'} />
        <Row label="Combustível" value={fuel} />
      </div>

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
      </div>

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
          <div className="det-section-title">Fotos ({jo.photos.length})</div>
          <div className="review-photos">
            {jo.photos.map((p: any) => p.url && (
              <div key={p.id} className="review-photo" onClick={() => setPhoto(p.url)}>
                <img src={p.url} alt={p.zone} />
              </div>
            ))}
          </div>
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

// ── ORDEM DE SERVIÇO — Fatia 1: Diagnóstico ──────────────────
function OrderService({ joId, onBack, myId, isOwner }: { joId: string; onBack: () => void; myId: string; isOwner: boolean }) {
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

  const load = () => {
    setLoading(true)
    api(`/api/v1/os/${joId}`).then(r => {
      setData(r)
      if (r.jo?.diagnosis_notes) setNotes(r.jo.diagnosis_notes)
    }).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [joId])

  const startOS = async () => {
    setStarting(true)
    try { await api(`/api/v1/os/start/${joId}`, { method: 'POST' }); load() }
    catch (e: any) { alert(e?.message || 'Não foi possível iniciar a OS.') }
    finally { setStarting(false) }
  }

  const jo = data?.jo
  const problems = data?.problems || []
  const isDiag = jo?.status === 'in_diagnosis'
  const isReview = jo?.status === 'diagnosis_review'
  const authOn = data?.diagAuthorizationOn
  const iSubmitted = jo?.diag_submitted_by === myId

  // não iniciada ainda
  if (loading) return <main className="reception"><p className="empty">A carregar…</p></main>
  if (!jo) return <main className="reception"><p className="empty">Não foi possível carregar.</p></main>

  if (!jo.os_opened_at) {
    return (
      <main className="reception">
        <div className="rec-top" style={{ marginBottom: 16 }}>
          <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Recepções</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>{jo.number}</h2><span />
        </div>
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
    if (newProblem.trim().length < 2) return
    try { await api(`/api/v1/os/${joId}/problems`, { method: 'POST', body: JSON.stringify({ description: newProblem, origin: 'team' }) }); setNewProblem(''); load() }
    catch { alert('Não foi possível adicionar.') }
  }
  const updateProblem = async (pid: string, fields: any) => {
    try { await api(`/api/v1/os/problems/${pid}`, { method: 'POST', body: JSON.stringify(fields) }); load() }
    catch { alert('Erro ao actualizar.') }
  }
  const deleteProblem = async (pid: string) => {
    if (!confirm('Apagar este problema?')) return
    try { await api(`/api/v1/os/problems/${pid}`, { method: 'DELETE' }); load() } catch { alert('Erro.') }
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
      } catch { alert('Não foi possível anexar a foto.') }
    }
    input.click()
  }
  const submitDiagnosis = async () => {
    try {
      const r = await api(`/api/v1/os/${joId}/submit-diagnosis`, { method: 'POST', body: JSON.stringify({ notes: notes || undefined }) })
      alert(r.status === 'diagnosis_review' ? 'Diagnóstico submetido para autorização.' : 'Diagnóstico concluído. OS pronta para orçamento.')
      load()
    } catch (e: any) { alert(e?.message || 'Não foi possível submeter.') }
  }
  const authorize = async () => {
    if (!authSig) return
    try { await api(`/api/v1/os/${joId}/authorize-diagnosis`, { method: 'POST', body: JSON.stringify({ approve: true, signature: authSig }) }); setShowAuth(false); load() }
    catch (e: any) { alert(e?.message || 'Erro ao autorizar.') }
  }
  const reject = async () => {
    if (!rejectNote.trim()) return
    try { await api(`/api/v1/os/${joId}/authorize-diagnosis`, { method: 'POST', body: JSON.stringify({ approve: false, note: rejectNote }) }); setRejecting(false); setRejectNote(''); load() }
    catch (e: any) { alert(e?.message || 'Erro.') }
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
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProblem() } }} />
            <button className="btn-primary" onClick={addProblem} disabled={newProblem.trim().length < 2}><i className="ti ti-plus" aria-hidden="true"></i></button>
          </div>
          <label className="fl" style={{ marginTop: 16 }}>Notas gerais do diagnóstico (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observações gerais…" />
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={submitDiagnosis} disabled={problems.length === 0}>
            {authOn ? 'Submeter diagnóstico para autorização' : 'Concluir diagnóstico'}
          </button>
        </>
      )}

      {isReview && (
        <div className="os-review-box">
          <div className="os-review-head"><i className="ti ti-clipboard-check" aria-hidden="true"></i> Diagnóstico aguarda autorização</div>
          <p className="det-notes">Submetido por {jo.diag_submitted_by_name}. {authOn && 'A autorização assume a responsabilidade técnica partilhada pelo diagnóstico.'}</p>
          {iSubmitted ? (
            <p className="det-empty">Não podes autorizar o teu próprio diagnóstico. Aguarda a autorização do responsável.</p>
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

  const dismissNotice = async () => {
    setShowNotice(false)
    try { await api('/api/v1/tasks/perf-notice/seen', { method: 'POST' }) } catch {}
  }

  const create = async () => {
    if (title.trim().length < 2 || !assignTo) return
    setBusy(true)
    try {
      await api('/api/v1/tasks', { method: 'POST', body: JSON.stringify({
        title, description: desc || undefined, assignedTo: assignTo,
        dueDate: due || undefined, priority,
        weight: isOwner ? weight : undefined,
        isPersonal: assignTo === myId,
        requiresConfirmation: reqConfirm || undefined,
        requiresAttachment: reqAttach || undefined,
        recurrence: recurrence || undefined,
      }) })
      setTitle(''); setDesc(''); setAssignTo(''); setDue(''); setPriority('normal')
      setWeight('normal'); setRecurrence(''); setReqConfirm(false); setReqAttach(false); setShowNew(false)
      load()
    } catch (e: any) { alert(e?.message || 'Não foi possível criar a tarefa.') }
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
          <button className="btn-primary btn-sm" onClick={() => setShowNew(true)}><i className="ti ti-plus" aria-hidden="true"></i> Nova</button>
        </div>
      </div>

      <div className="task-tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>As minhas ({mine.filter(t => t.status !== 'done').length})</button>
        {(assignable.length > 0 || assigned.length > 0) && <button className={tab === 'assigned' ? 'on' : ''} onClick={() => setTab('assigned')}>Que atribuí ({assigned.filter(t => t.status !== 'done').length})</button>}
      </div>

      {showNew && (
        <div className="task-form">
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
            <button className="btn-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
            <button className="btn-primary" disabled={busy || title.trim().length < 2 || !assignTo} onClick={create}>
              {busy ? 'A criar…' : 'Criar tarefa'}
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
