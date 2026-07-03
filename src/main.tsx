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
      setSession(data)   // aplica branding do tenant automaticamente
    } catch (e: any) {
      setErr(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="gh-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="3" y="3" width="30" height="30" rx="8" stroke="currentColor" strokeWidth="2.5"/>
            <path d="M12 18h12M18 12v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <div>
            <div className="gh-name">OficinaHub</div>
            <div className="gh-sub">Plataforma de gestão de oficinas</div>
          </div>
        </div>
        <form onSubmit={submit}>
          <label className="fl">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nome@oficina.com" autoComplete="email" required />
          <label className="fl" style={{ marginTop: 14 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password" required />
          {err && <div className="err-box">{err}</div>}
          <button className="btn-primary btn-lg" disabled={busy} style={{ marginTop: 20, width: '100%' }}>
            {busy ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </div>
      <div className="login-footer">OficinaHub · gestão modular para oficinas</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// SHELL — após login, com a marca do tenant
// ────────────────────────────────────────────────────────────
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
        <div className="tenant-name-block">
          <div className="tenant-name">{tenant?.name}</div>
          <div className="tenant-powered">powered by OficinaHub</div>
        </div>
        <div className="header-right">
          {!online && <span className="offline-pill">Offline{pending > 0 ? ` · ${pending} por sincronizar` : ''}</span>}
          {online && pending > 0 && <span className="sync-pill">{pending} a sincronizar…</span>}
          <span className="user-name">{user?.name}</span>
          <button className="btn-ghost" onClick={logout}>Sair</button>
        </div>
      </header>

      {view === 'home' && (
        <main className="home">
          <h1>Bem-vindo, {user?.name?.split(' ')[0]}</h1>
          <div className="home-actions">
            <button className="action-card" onClick={() => setView('reception')}>
              <span className="action-title">Nova recepção</span>
              <span className="action-sub">Fotos · JO · assinatura digital</span>
            </button>
            <button className="action-card" onClick={() => setView('list')}>
              <span className="action-title">Recepções</span>
              <span className="action-sub">Ver JOs criadas</span>
            </button>
          </div>
        </main>
      )}
      {view === 'reception' && <Reception onDone={() => setView('list')} onBack={() => setView('home')} />}
      {view === 'list' && <ReceptionList onBack={() => setView('home')} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// RECEPÇÃO BLINDADA — câmara real + GPS real + offline
// ────────────────────────────────────────────────────────────
const REQ_ZONES = [
  { key: 'front', label: 'Frente' }, { key: 'rear', label: 'Traseira' },
  { key: 'left', label: 'Lado esq.' }, { key: 'right', label: 'Lado dir.' },
  { key: 'roof', label: 'Tecto' }, { key: 'interior', label: 'Interior' },
]
const CHECKLIST = ['Livrete / documentos','Chaves entregues','Triângulo + colete',
  'Pneu suplente + macaco','Rádio com código','Tapetes originais']

function Reception({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0)
  const [units, setUnits] = useState<any[]>([])
  const [terms, setTerms] = useState<any>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  // dados do formulário
  const [unitId, setUnitId] = useState('')
  const [photos, setPhotos] = useState<Record<string, Blob>>({})
  const [km, setKm] = useState(''); const [kmPhoto, setKmPhoto] = useState<Blob | null>(null)
  const [fuel, setFuel] = useState(2)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [valuables, setValuables] = useState('')
  const [custName, setCustName] = useState(''); const [custPhone, setCustPhone] = useState('')
  const [plate, setPlate] = useState(''); const [brand, setBrand] = useState(''); const [model, setModel] = useState('')
  const [svcDesc, setSvcDesc] = useState('')
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

  // Abre a câmara nativa do tablet
  const takePhoto = (zone: string) => {
    pendingZone.current = zone
    fileRef.current?.click()
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (pendingZone.current === '__km__') setKmPhoto(f)
    else setPhotos(p => ({ ...p, [pendingZone.current]: f }))
    e.target.value = ''
  }

  const reqCount = REQ_ZONES.filter(z => photos[z.key]).length
  const allTc = tc.every(Boolean)

  const submit = async () => {
    setBusy(true)
    const payload = {
      businessUnitId: unitId, source: 'walkin',
      customer: { fullName: custName, phone: custPhone },
      vehicle: { plate: plate.toUpperCase(), brand, model },
      kmEntry: Number(km), fuelLevel: fuel,
      declaredValuables: valuables || 'Nenhum objecto declarado',
      checklist, damageZones: [],
      serviceDescription: svcDesc,
      termsVersion: terms?.version || '1.0',
      termsAcceptedAt: new Date().toISOString(),
    }

    try {
      if (!navigator.onLine) throw new Error('OFFLINE')

      const jo = await api('/api/v1/receptions', { method: 'POST', body: JSON.stringify(payload) })

      // Upload das fotos obrigatórias + km
      for (const z of REQ_ZONES) {
        if (photos[z.key]) await uploadPhoto(jo.id, z.key, photos[z.key],
          { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      }
      if (kmPhoto) await uploadPhoto(jo.id, 'km', kmPhoto,
        { isRequired: false, latitude: gps?.lat, longitude: gps?.lng })

      // Assinatura sela a JO (backend valida as 6 fotos)
      if (sigData) {
        await api(`/api/v1/receptions/${jo.id}/sign`, {
          method: 'POST',
          body: JSON.stringify({ signatureBase64: sigData.split(',')[1] }),
        })
      }
      setResult({ number: jo.number, offline: false })
    } catch (e: any) {
      // Guardar offline — sincroniza quando houver net
      const offlineId = await offline.enqueueReception(payload)
      for (const z of REQ_ZONES) {
        if (photos[z.key]) await offline.savePhotoBlob(offlineId, z.key, photos[z.key],
          { isRequired: true, latitude: gps?.lat, longitude: gps?.lng })
      }
      if (kmPhoto) await offline.savePhotoBlob(offlineId, 'km', kmPhoto, {})
      setResult({ number: 'Pendente (offline)', offline: true })
    } finally { setBusy(false) }
  }

  if (result) return (
    <main className="reception">
      <div className="success-box">
        <div className="success-number">{result.number}</div>
        <p>{result.offline
          ? 'Recepção guardada no tablet. Sincroniza automaticamente quando houver internet.'
          : 'JO criada, fotos carregadas e documento assinado arquivado.'}</p>
        <button className="btn-primary" onClick={onDone}>Ver recepções</button>
      </div>
    </main>
  )

  const steps = ['Fotos', 'Km', 'Estado', 'Cliente & viatura', 'Serviço', 'Assinatura']

  return (
    <main className="reception">
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={onFile} />

      <div className="rec-header">
        <button className="btn-ghost" onClick={onBack}>← Sair</button>
        <div className="rec-steps">{steps.map((s, i) => (
          <span key={s} className={`rec-step ${i === step ? 'cur' : i < step ? 'done' : ''}`}>{s}</span>
        ))}</div>
        {gps && <span className="gps-ok">GPS ✓</span>}
      </div>

      {step === 0 && (
        <section>
          <h2>Fotos 360° <span className="req">— 6 obrigatórias</span></h2>
          <div className="photo-grid">
            {REQ_ZONES.map(z => (
              <button key={z.key} className={`photo-slot ${photos[z.key] ? 'done' : ''}`}
                onClick={() => takePhoto(z.key)}>
                {photos[z.key]
                  ? <img src={URL.createObjectURL(photos[z.key])} alt={z.label} />
                  : <span className="photo-icon">📷</span>}
                <span>{z.label}</span>
              </button>
            ))}
          </div>
          <div className={`count-bar ${reqCount >= 6 ? 'ok' : 'bad'}`}>
            {reqCount} de 6 fotos obrigatórias {reqCount >= 6 ? '— completo' : `— faltam ${6 - reqCount}`}
          </div>
          <div className="rec-nav">
            <span />
            <button className="btn-primary" disabled={reqCount < 6} onClick={() => setStep(1)}>Próximo →</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2>Quilometragem <span className="req">— foto obrigatória</span></h2>
          <div className="km-row">
            <div style={{ flex: 1 }}>
              <label className="fl">Km no conta-quilómetros</label>
              <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} placeholder="ex: 87340" />
            </div>
            <button className={`photo-slot km ${kmPhoto ? 'done' : ''}`}
              onClick={() => { pendingZone.current = '__km__'; fileRef.current?.click() }}>
              {kmPhoto ? <img src={URL.createObjectURL(kmPhoto)} alt="km" /> : <span className="photo-icon">📷</span>}
              <span>Foto conta-km</span>
            </button>
          </div>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(0)}>← Anterior</button>
            <button className="btn-primary" disabled={!km || !kmPhoto} onClick={() => setStep(2)}>Próximo →</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>Combustível, itens e objectos</h2>
          <label className="fl">Nível de combustível — {Math.round(fuel / 8 * 100)}%</label>
          <div className="fuel-segs">
            {Array.from({ length: 8 }).map((_, i) => (
              <button key={i} className={`fs ${i < fuel ? 'on' : ''}`} onClick={() => setFuel(i + 1)} />
            ))}
          </div>
          <label className="fl" style={{ marginTop: 16 }}>Itens entregues</label>
          <div className="chk-grid">
            {CHECKLIST.map(c => (
              <button key={c} className={`chk ${checklist[c] ? 'on' : ''}`}
                onClick={() => setChecklist(p => ({ ...p, [c]: !p[c] }))}>
                <span className="chk-box">{checklist[c] ? '✓' : ''}</span>{c}
              </button>
            ))}
          </div>
          <label className="fl" style={{ marginTop: 16 }}>Objectos declarados pelo cliente <span className="req">*</span></label>
          <textarea value={valuables} onChange={e => setValuables(e.target.value)}
            placeholder="Descreve os objectos deixados na viatura…" rows={2} />
          <button className="btn-ghost btn-sm" onClick={() => setValuables('Nenhum objecto de valor declarado pelo cliente.')}>
            Nenhum objecto
          </button>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(1)}>← Anterior</button>
            <button className="btn-primary" disabled={!valuables} onClick={() => setStep(3)}>Próximo →</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>Cliente e viatura</h2>
          <div className="grid2">
            <div><label className="fl">Nome do cliente *</label>
              <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nome completo" /></div>
            <div><label className="fl">Telemóvel *</label>
              <input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="+258 84 000 0000" /></div>
          </div>
          <div className="grid3" style={{ marginTop: 12 }}>
            <div><label className="fl">Matrícula *</label>
              <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="MZA 0000"
                style={{ textTransform: 'uppercase', fontWeight: 600 }} /></div>
            <div><label className="fl">Marca</label>
              <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="ex: Subaru" /></div>
            <div><label className="fl">Modelo</label>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="ex: Impreza" /></div>
          </div>
          {units.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <label className="fl">Unidade</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(2)}>← Anterior</button>
            <button className="btn-primary" disabled={!custName || !custPhone || !plate}
              onClick={() => setStep(4)}>Próximo →</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          <h2>Serviço solicitado</h2>
          <label className="fl">Descrição / queixa do cliente *</label>
          <textarea value={svcDesc} onChange={e => setSvcDesc(e.target.value)} rows={3}
            placeholder="Descreve o serviço pedido ou sintoma relatado…" />
          <div className="info-note">Após a recepção, o orçamento será enviado ao cliente para aprovação digital. Nada é executado sem aprovação.</div>
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(3)}>← Anterior</button>
            <button className="btn-primary" disabled={svcDesc.length < 3} onClick={() => setStep(5)}>Próximo →</button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section>
          <h2>Termos e assinatura do cliente</h2>
          <div className="tc-scroll">{terms?.content || 'A carregar termos…'}</div>
          {[
            'Li e aceito os Termos e Condições, incluindo o registo fotográfico como prova do estado da viatura.',
            `Aceito a política de parqueamento — ${terms?.parking_fee || 500} MZN/dia após ${terms?.parking_grace_hours || 48}h de aviso de conclusão.`,
            'Autorizo diagnóstico e o tratamento dos meus dados para gestão do serviço.',
          ].map((label, i) => (
            <button key={i} className={`chk tc ${tc[i] ? 'on' : ''}`}
              onClick={() => setTc(t => t.map((v, j) => j === i ? !v : v))}>
              <span className="chk-box">{tc[i] ? '✓' : ''}</span>{label}
            </button>
          ))}
          <label className="fl" style={{ marginTop: 14 }}>Assinatura do cliente *</label>
          <SignaturePad onChange={setSigData} />
          <div className="rec-nav">
            <button className="btn-ghost" onClick={() => setStep(4)}>← Anterior</button>
            <button className="btn-primary" disabled={!allTc || !sigData || busy} onClick={submit}>
              {busy ? 'A finalizar…' : 'Finalizar e abrir JO'}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

// ── Canvas de assinatura ─────────────────────────────────────
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
