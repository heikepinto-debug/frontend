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
          <div className="gh-mark"><i className="ti ti-e-passport" style={{ fontSize: 22 }} aria-hidden="true"></i></div>
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
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [view, setView] = useState<'home' | 'reception' | 'list'>('home')

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    startAutoSync(() => offline.pendingCount().then(setPending))
    const t = setInterval(() => offline.pendingCount().then(setPending), 5000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [])

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
        <main className="home">
          <h1>Olá, {user?.name?.split(' ')[0]}</h1>
          <div className="home-actions">
            <button className="action-card" onClick={() => setView('reception')}>
              <div className="action-ic"><i className="ti ti-car" aria-hidden="true"></i></div>
              <span className="action-title">Nova recepção</span>
              <span className="action-sub">Cliente, viatura, fotos e assinatura</span>
            </button>
            <button className="action-card" onClick={() => setView('list')}>
              <div className="action-ic"><i className="ti ti-list-details" aria-hidden="true"></i></div>
              <span className="action-title">Recepções</span>
              <span className="action-sub">Ver ordens de trabalho criadas</span>
            </button>
          </div>
        </main>
      )}
      {view === 'reception' && <Reception onDone={() => setView('list')} onBack={() => setView('home')} />}
      {view === 'list' && <ReceptionList onBack={() => setView('home')} />}
    </div>
  )
}

const REQ_ZONES = [
  { key: 'front', label: 'Frente' }, { key: 'rear', label: 'Traseira' },
  { key: 'left', label: 'Lado esq.' }, { key: 'right', label: 'Lado dir.' },
  { key: 'roof', label: 'Tecto' }, { key: 'interior', label: 'Interior' },
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


function Reception({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0)
  const [units, setUnits] = useState<any[]>([])
  const [terms, setTerms] = useState<any>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

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

  const [svcDesc, setSvcDesc] = useState(''); const [svcType, setSvcType] = useState('')
  const [unitId, setUnitId] = useState('')
  const [services, setServices] = useState<any[]>([])
  const [loadingSvc, setLoadingSvc] = useState(false)

  const [km, setKm] = useState(''); const [fuel, setFuel] = useState(2)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [valuables, setValuables] = useState('')

  const [damages, setDamages] = useState<Damage[]>([])
  const [dmgGroup, setDmgGroup] = useState(0)

  const [photos, setPhotos] = useState<Record<string, Blob>>({})
  const [kmPhoto, setKmPhoto] = useState<Blob | null>(null)

  const [tc, setTc] = useState([false, false, false])
  const [sigData, setSigData] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ number: string; offline: boolean } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const pendingZone = useRef<string>('')

  useEffect(() => {
    api('/api/v1/business-units').then(r => { setUnits(r.data); if (r.data[0]) setUnitId(r.data[0].id) }).catch(() => {})
    api('/api/v1/terms/active').then(setTerms).catch(() => {})
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true, timeout: 8000 })
  }, [])

  // Carrega os serviços do sector escolhido — só esses aparecem
  useEffect(() => {
    if (!unitId) return
    setLoadingSvc(true); setSvcType('')
    api(`/api/v1/services?unitId=${unitId}`)
      .then(r => setServices(r.data))
      .catch(() => setServices([]))
      .finally(() => setLoadingSvc(false))
  }, [unitId])

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
    if (z === '__km__') setKmPhoto(f)
    else if (z.startsWith('__dmg__')) {
      const id = z.replace('__dmg__', '')
      setDamages(ds => ds.map(d => d.id === id ? { ...d, photo: f } : d))
    }
    else setPhotos(p => ({ ...p, [z]: f }))
    e.target.value = ''
  }

  const addDamage = (area: string) =>
    setDamages(ds => [...ds, { id: crypto.randomUUID().slice(0, 8), area, note: '', photo: null }])
  const removeDamage = (id: string) => setDamages(ds => ds.filter(d => d.id !== id))
  const setDmgNote = (id: string, note: string) =>
    setDamages(ds => ds.map(d => d.id === id ? { ...d, note } : d))

  const reqCount = REQ_ZONES.filter(z => photos[z.key]).length
  const allTc = tc.every(Boolean)

  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!existingCust || (newCust && custName.trim().length >= 2 && V.phone(custPhone) && V.email(custEmail))
      case 1: return !!existingVeh || (V.plate(plate) && V.year(vyear))
      case 2: return !!svcType && svcDesc.trim().length >= 3
      case 3: return valuables.trim().length > 0 && V.km(km)
      case 4: return true                       // danos são opcionais
      case 5: return reqCount >= 6 && !!kmPhoto
      case 6: return allTc && !!sigData
      default: return true
    }
  }

  const submit = async () => {
    setBusy(true)
    const payload: any = {
      businessUnitId: unitId, source: 'walkin',
      customer: existingCust ? { id: existingCust.id }
        : { fullName: custName, phone: custPhone, email: custEmail || undefined },
      vehicle: existingVeh ? { id: existingVeh.id, plate: existingVeh.plate }
        : { plate: plate.toUpperCase(), brand, model, year: vyear ? Number(vyear) : undefined },
      kmEntry: Number(km), fuelLevel: fuel,
      declaredValuables: valuables || 'Nenhum objecto declarado',
      checklist,
      damageZones: damages.map(d => ({ id: d.id, area: d.area, note: d.note })),
      serviceType: svcType, serviceDescription: svcDesc,
      termsVersion: terms?.version || '1.0',
      termsAcceptedAt: new Date().toISOString(),
    }
    try {
      if (!navigator.onLine) throw new Error('OFFLINE')
      const jo = await api('/api/v1/receptions', { method: 'POST', body: JSON.stringify(payload) })
      for (const z of REQ_ZONES)
        if (photos[z.key]) await uploadPhoto(jo.id, z.key, photos[z.key], { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      if (kmPhoto) await uploadPhoto(jo.id, 'km', kmPhoto, { latitude: gps?.lat, longitude: gps?.lng })
      for (const d of damages)
        if (d.photo) await uploadPhoto(jo.id, `damage-${d.id}`, d.photo, { latitude: gps?.lat, longitude: gps?.lng })
      if (sigData) await api(`/api/v1/receptions/${jo.id}/sign`, {
        method: 'POST', body: JSON.stringify({ signatureBase64: sigData.split(',')[1] }),
      })
      setResult({ number: jo.number, offline: false })
    } catch {
      const offlineId = await offline.enqueueReception(payload)
      for (const z of REQ_ZONES)
        if (photos[z.key]) await offline.savePhotoBlob(offlineId, z.key, photos[z.key], { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      if (kmPhoto) await offline.savePhotoBlob(offlineId, 'km', kmPhoto, {})
      for (const d of damages)
        if (d.photo) await offline.savePhotoBlob(offlineId, `damage-${d.id}`, d.photo, {})
      setResult({ number: 'Pendente (offline)', offline: true })
    } finally { setBusy(false) }
  }

  if (result) return (
    <main className="reception">
      <div className="success-box">
        <div className="success-ic"><i className="ti ti-check" aria-hidden="true"></i></div>
        <div className="success-number">{result.number}</div>
        <p>{result.offline
          ? 'Recepção guardada no tablet. Sincroniza automaticamente quando houver internet.'
          : 'Ordem de trabalho criada, fotos carregadas e documento assinado arquivado.'}</p>
        <button className="btn-primary" onClick={onDone} style={{ justifyContent: 'center' }}>Ver recepções</button>
      </div>
    </main>
  )

  const steps = ['Cliente', 'Viatura', 'Serviço', 'Estado', 'Danos', 'Fotos', 'Assinatura']

  return (
    <main className="reception">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />

      <div className="rec-top">
        <button className="btn-ghost btn-sm" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true"></i> Sair</button>
        <span className="rec-stepname">{step + 1} de {steps.length} · {steps[step]}</span>
        {gps ? <span className="gps-ok"><i className="ti ti-map-pin" aria-hidden="true"></i> GPS</span> : <span />}
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

      {/* 3 — SERVIÇO (filtrado por sector) */}
      {step === 2 && (
        <section>
          <h2>Serviço pretendido</h2>
          <p className="lead">Cada sector oferece os seus serviços. Escolhe o que traz o cliente.</p>

          {units.length > 1 && (
            <>
              <label className="fl">Sector</label>
              <div className="sector-tabs">
                {units.map(u => (
                  <button key={u.id} className={`sector-tab ${unitId === u.id ? 'on' : ''}`} onClick={() => setUnitId(u.id)}>
                    <i className={`ti ${u.type === 'workshop_tuning' ? 'ti-rocket' : u.type === 'store' ? 'ti-building-store' : 'ti-tools'}`} aria-hidden="true"></i>
                    {u.name.replace(/^FIT — /, '').replace(/^FIT /, '')}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="fl" style={{ marginTop: 18 }}>Serviço <span className="req">*</span></label>
          {loadingSvc && <div className="hint">A carregar serviços…</div>}
          {!loadingSvc && services.length === 0 && <div className="hint">Este sector ainda não tem serviços configurados.</div>}
          {Object.entries(
            services.reduce((acc: Record<string, any[]>, s) => {
              (acc[s.category || 'Serviços'] ||= []).push(s); return acc
            }, {})
          ).map(([cat, list]) => (
            <div key={cat} className="svc-group">
              <div className="svc-cat">{cat}</div>
              <div className="svc-grid">
                {(list as any[]).map(s => (
                  <button key={s.id} className={`svc-card ${svcType === s.name ? 'on' : ''}`} onClick={() => setSvcType(s.name)}>
                    <span className="svc-name">{s.name}</span>
                    {s.est_hours && <span className="svc-hrs">~{s.est_hours}h</span>}
                    {svcType === s.name && <span className="svc-check"><i className="ti ti-check" aria-hidden="true"></i></span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <label className="fl" style={{ marginTop: 18 }}>Descrição / queixa do cliente <span className="req">*</span></label>
          <textarea value={svcDesc} onChange={e => setSvcDesc(e.target.value)} rows={3} placeholder="Detalhes, sintomas ou pedidos específicos do cliente…" />
          <div className="info-note"><i className="ti ti-info-circle" style={{ fontSize: 16 }} aria-hidden="true"></i><span>Após a recepção, o orçamento vai ao cliente para aprovação digital. Nada é executado sem aprovação.</span></div>
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

      {/* 6 — FOTOS */}
      {step === 5 && (
        <section>
          <h2>Fotos 360° <span className="req">— 6 obrigatórias</span></h2>
          <p className="lead">Dá a volta ao carro. Cada foto guarda data, hora e GPS — prova do estado à entrada.</p>
          <div className="photo-grid">
            {REQ_ZONES.map(z => (
              <button key={z.key} className={`photo-slot ${photos[z.key] ? 'done' : ''}`} onClick={() => takePhoto(z.key)}>
                {photos[z.key] ? <img src={URL.createObjectURL(photos[z.key])} alt={z.label} /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
                <span>{z.label}</span>
              </button>
            ))}
          </div>
          <div className={`count-bar ${reqCount >= 6 ? 'ok' : 'bad'}`}>
            <i className={`ti ${reqCount >= 6 ? 'ti-circle-check' : 'ti-alert-triangle'}`} aria-hidden="true"></i>
            {reqCount} de 6 fotos {reqCount >= 6 ? '— completo' : `— faltam ${6 - reqCount}`}
          </div>
          <label className="fl" style={{ marginTop: 16 }}>Foto do conta-km <span className="req">*</span></label>
          <button className={`photo-slot km ${kmPhoto ? 'done' : ''}`} onClick={() => takePhoto('__km__')}>
            {kmPhoto ? <img src={URL.createObjectURL(kmPhoto)} alt="km" /> : <span className="photo-icon"><i className="ti ti-camera" aria-hidden="true"></i></span>}
            <span>Conta-km</span>
          </button>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(4)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep(6)}>Próximo <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
      )}

      {/* 7 — TERMOS + ASSINATURA */}
      {step === 6 && (
        <section>
          <h2>Termos e assinatura</h2>
          <p className="lead">O cliente lê, aceita e assina. A ordem de trabalho fica selada e arquivada.</p>
          <div className="tc-scroll">{terms?.content || 'A carregar termos…'}</div>
          {[
            'Li e aceito os Termos e Condições, incluindo o registo fotográfico como prova do estado da viatura.',
            `Aceito a política de parqueamento — ${terms?.parking_fee || 500} MZN/dia após ${terms?.parking_grace_hours || 48}h de aviso de conclusão.`,
            'Autorizo diagnóstico e o tratamento dos meus dados para gestão do serviço.',
          ].map((label, i) => (
            <button key={i} className={`chk tc ${tc[i] ? 'on' : ''}`} onClick={() => setTc(t => t.map((v, j) => j === i ? !v : v))}>
              <span className="chk-box">{tc[i] && <i className="ti ti-check" aria-hidden="true"></i>}</span>{label}
            </button>
          ))}
          <label className="fl" style={{ marginTop: 14 }}>Assinatura do cliente <span className="req">*</span></label>
          <SignaturePad onChange={setSigData} />
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(5)}><i className="ti ti-arrow-left" aria-hidden="true"></i> Anterior</button>
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
function ReceptionList({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { api('/api/v1/receptions').then(r => setRows(r.data)).catch(() => {}) }, [])
  return (
    <main className="reception">
      <div className="rec-header">
        <button className="btn-ghost" onClick={onBack}>← Início</button>
        <h2 style={{ margin: 0 }}>Recepções</h2><span />
      </div>
      <div className="list">
        {rows.map(r => (
          <div key={r.id} className="list-row">
            <span className="jo-num">{r.number}</span>
            <span className="plate">{r.plate}</span>
            <div style={{ flex: 1 }}>
              <div className="list-name">{r.customer_name}</div>
              <div className="list-sub">{r.brand} {r.model} · {r.photo_count} fotos{r.signed_at ? ' · assinada' : ''}</div>
            </div>
            <span className={`status s-${r.status}`}>{r.status}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="empty">Ainda sem recepções.</p>}
      </div>
    </main>
  )
}

// ── Bootstrap ────────────────────────────────────────────────
function App() {
  const token = useSession(s => s.accessToken)
  return token ? <Shell /> : <Login />
}
createRoot(document.getElementById('root')!).render(<App />)
