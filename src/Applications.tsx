import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUpRight, BellRing, BriefcaseBusiness, CalendarClock, Check, Columns3, Copy, ExternalLink, FileLock, FileText, GripVertical, List, Plus, Save, ScanSearch, Search } from 'lucide-react'
import { paperMarkup } from './exports'
import { roleTracks, stages, type Application, type AppTrack, type Data, type ResumeDocument, type Snapshot, type Stage, type Variant } from './model'
import { openLink } from './native'
import { boardStage, boardStages, countdown, dateTimeInput, deadlineSortKey, formatDate, localDate, moveApplication, newApplication, stageNames, type BoardStage } from './pipeline'
import { Preview } from './Preview'
import { safeUrl } from './resume'
import { useStore } from './store'
import { Modal } from './ui'

const NotesPreview = lazy(() => import('./NotesPreview'))
const appTracks = [...roleTracks, 'Other'] as const
const platforms = ['CodeSignal', 'HackerRank', 'Karat', 'LeetCode', 'Take-Home', 'Other']
const titleOf = (stage: BoardStage) => stage === 'rejected' ? 'Rejected / Ghosted' : stageNames[stage]
const sortedCards = (rows: Application[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at))

export function Applications() {
  const data = useStore((s) => s.data)
  const [mode, setMode] = useState<'board' | 'table'>('board')
  const [draft, setDraft] = useState<Application>()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  const edit = (app: Application) => setDraft(app)
  return <div className="view">
    <header className="page-heading studio-heading"><div><h1>Applications</h1><p>Track internships from wishlist to decision.</p></div>
      <button className="button primary" onClick={() => setDraft({ ...newApplication(), sort_order: Math.max(-1, ...data.applications.map((app) => app.sort_order)) + 1 })}><Plus size={16}/> Add application</button>
    </header>
    <Urgent rows={data.applications} now={now} edit={edit}/>
    <div className="tracker-toolbar">
      <div className="segmented" aria-label="Tracker view">
        <button className={mode === 'board' ? 'active' : ''} aria-pressed={mode === 'board'} onClick={() => setMode('board')}><Columns3 size={15}/> Board</button>
        <button className={mode === 'table' ? 'active' : ''} aria-pressed={mode === 'table'} onClick={() => setMode('table')}><List size={15}/> Table</button>
      </div>
      <span className="muted">{data.applications.length} {data.applications.length === 1 ? 'application' : 'applications'}</span>
    </div>
    {mode === 'board' ? <Board rows={data.applications} edit={edit} now={now}/> : <ApplicationTable data={data} edit={edit}/>}
    {draft && <ApplicationDrawer key={draft.id} application={draft} snapshot={data.resume_snapshots.find((row) => row.id === draft.snapshot_id)}
      close={() => setDraft(undefined)} isNew={!data.applications.some((app) => app.id === draft.id)}/>}
  </div>
}

function Urgent({ rows, now, edit }: { rows: Application[]; now: Date; edit: (row: Application) => void }) {
  const urgent = rows.flatMap((row) => {
    const due = countdown(row.oa_deadline, now)
    return due && (row.stage === 'oa' || row.stage === 'technical') ? [{ row, due }] : []
  }).sort((a, b) => deadlineSortKey(a.row.oa_deadline) - deadlineSortKey(b.row.oa_deadline))
  if (!urgent.length) return null
  return <section className="urgent-banner" aria-label="Upcoming OA deadlines">
    <BellRing size={18}/><strong>OA deadlines</strong>
    <div className="urgent-list">{urgent.map(({ row, due }) => <button className="urgent-link" onClick={() => edit(row)} key={row.id}>
      {row.company}<span className={'chip ' + due.tone}>{due.label}</span><ArrowUpRight size={13}/>
    </button>)}</div>
  </section>
}

const detectBoardDrop: CollisionDetection = (args) => {
  const collisions = pointerWithin(args)
  if (!collisions.length) return args.pointerCoordinates ? [] : closestCenter(args)
  const [card] = collisions.filter(({ id }) => !String(id).startsWith('column:'))
  return card ? [card] : collisions
}

function Board({ rows, edit, now }: { rows: Application[]; edit: (app: Application) => void; now: Date }) {
  const save = useStore((s) => s.save)
  const [dragging, setDragging] = useState<string>()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const dragged = rows.find((row) => row.id === dragging)
  const handleDrop = ({ active, over }: DragEndEvent) => {
    setDragging(undefined)
    if (!over || active.id === over.id) return
    const from = rows.find((row) => row.id === active.id)
    const target = rows.find((row) => row.id === over.id)
    const stage = target ? boardStage(target.stage) : over.data.current?.column as BoardStage | undefined
    if (!from || !stage) return
    const destination = sortedCards(rows.filter((row) => boardStage(row.stage) === stage))
    const oldIndex = destination.findIndex((row) => row.id === from.id)
    const targetIndex = target ? destination.findIndex((row) => row.id === target.id) : destination.length
    const next = destination.filter((row) => row.id !== from.id)
    const index = target ? Math.min(next.length, targetIndex) : next.length
    if (oldIndex === index && boardStage(from.stage) === stage) return
    next.splice(index, 0, from)
    void save('application', ...next.map((application, order) => moveApplication(application, stage, order)))
  }
  return <DndContext sensors={sensors} collisionDetection={detectBoardDrop} onDragStart={({ active }) => setDragging(String(active.id))}
    onDragCancel={() => setDragging(undefined)} onDragEnd={handleDrop}>
    <div className="kanban">
      {boardStages.map((column) => <BoardColumn stage={column} rows={sortedCards(rows.filter((row) => boardStage(row.stage) === column))} edit={edit} now={now} key={column}/>)}
    </div>
    <DragOverlay>{dragged && <div className="kanban-card overlay"><strong>{dragged.company}</strong><small>{dragged.role}</small></div>}</DragOverlay>
  </DndContext>
}

function BoardColumn({ stage, rows, edit, now }: { stage: BoardStage; rows: Application[]; edit: (row: Application) => void; now: Date }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'column:' + stage, data: { column: stage } })
  return <section ref={setNodeRef} className={'kanban-column panel' + (isOver ? ' dropping' : '')} aria-label={titleOf(stage)}>
    <header><span className={'stage-dot ' + stage}/><h2>{titleOf(stage)}</h2><span className="section-count">{rows.length}</span></header>
    <SortableContext items={rows} strategy={verticalListSortingStrategy}>
      {rows.map((row) => <BoardCard key={row.id} application={row} edit={() => edit(row)} now={now}/>)}
    </SortableContext>
    {!rows.length && <div className="column-empty">Drop here</div>}
  </section>
}

function BoardCard({ application, edit, now }: { application: Application; edit: () => void; now: Date }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: application.id })
  const deadline = countdown(application.oa_deadline, now)
  const showDeadline = deadline && (application.stage === 'oa' || application.stage === 'technical')
  return <div ref={setNodeRef} className="kanban-card" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .28 : undefined }}>
    <div className="kanban-card-top">
      <button className="row-main" onClick={edit}><strong>{application.company}</strong><small>{application.role}</small></button>
      <button className="grip" aria-label={'Drag ' + application.company} title="Drag application" ref={setActivatorNodeRef} {...attributes} {...listeners}><GripVertical size={14}/></button>
    </div>
    <div className="card-tags"><span className="chip">{application.track}</span>
      {application.snapshot_id && <span className="chip selected" title="Frozen resume"><FileLock size={12}/></span>}
      {boardStage(application.stage) === 'rejected' && <StageBadge stage={application.stage}/>}
      {showDeadline && <span className={'chip ' + deadline.tone}><CalendarClock size={11}/>{deadline.label}</span>}
    </div>
  </div>
}

function StageBadge({ stage }: { stage: Stage }) {
  return <span className="chip stage-badge"><span className={'stage-dot ' + stage}/>{stageNames[stage]}</span>
}

function ApplicationTable({ data, edit }: { data: Data; edit: (app: Application) => void }) {
  const [query, setQuery] = useState('')
  const [track, setTrack] = useState('')
  const [stage, setStage] = useState('')
  const [variant, setVariant] = useState('')
  const [sort, setSort] = useState('applied')
  const snapshots = new Map(data.resume_snapshots.map((entry) => [entry.id, entry]))
  const label = (entry: Application) => snapshots.get(entry.snapshot_id ?? '')?.variant_name
  const variants = [...new Set([...data.resume_variants.map(({ name }) => name), ...data.resume_snapshots.map(({ variant_name }) => variant_name)])].sort()
  const rows = data.applications.filter((app) => {
    const text = [app.company, app.role, app.location, app.referral, label(app)].join(' ').toLowerCase()
    return text.includes(query.trim().toLowerCase()) && (!track || app.track === track) && (!stage || app.stage === stage)
      && (!variant || (variant === 'no-snapshot' ? !app.snapshot_id : label(app) === variant.slice('variant:'.length)))
  }).sort((a, b) => sort === 'deadline' ? deadlineSortKey(a.oa_deadline) - deadlineSortKey(b.oa_deadline) || a.company.localeCompare(b.company)
    : (b.applied_date ?? '').localeCompare(a.applied_date ?? '') || a.company.localeCompare(b.company))
  return <section className="panel table-panel">
    <div className="table-filters">
      <label className="table-search"><Search size={15}/><input aria-label="Search applications" placeholder="Search applications…" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
      <select aria-label="Filter by Track" value={track} onChange={(e) => setTrack(e.target.value)}><option value="">All tracks</option>{appTracks.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Filter by Stage" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{stages.map((item) => <option value={item} key={item}>{stageNames[item]}</option>)}</select>
      <select aria-label="Filter by Variant" value={variant} onChange={(e) => setVariant(e.target.value)}><option value="">All variants</option><option value="no-snapshot">No snapshot</option>{variants.map((item) => <option key={item} value={'variant:' + item}>{item}</option>)}</select>
      <select aria-label="Sort applications" value={sort} onChange={(e) => setSort(e.target.value)}><option value="applied">Date applied</option><option value="deadline">OA deadline</option></select>
    </div>
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>Company / Role</th><th>Track</th><th>Stage</th><th>Variant</th><th>Applied</th><th>OA deadline</th></tr></thead>
      <tbody>{rows.map((app) => <tr key={app.id}>
        <td><button className="row-main" onClick={() => edit(app)}><strong>{app.company}</strong><small>{app.role}</small></button></td>
        <td><span className="chip">{app.track}</span></td><td><StageBadge stage={app.stage}/></td><td>{label(app) ?? '—'}</td>
        <td>{formatDate(app.applied_date)}</td><td>{formatDate(app.oa_deadline)}</td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="empty">No applications match these filters.</p>}
  </section>
}

const textFields = { company: 'Company', role: 'Role', location: 'Location', compensation: 'Compensation', job_url: 'Job URL', referral: 'Referral' } as const

function ApplicationDrawer({ application, snapshot, close, isNew }: { application: Application; snapshot?: Snapshot; close: () => void; isNew: boolean }) {
  const [draft, setDraft] = useState(application)
  const [showMarkdown, setShowMarkdown] = useState(false)
  const [decision, setDecision] = useState(false)
  const [busy, setBusy] = useState(false)
  const { save, remove, setView, setJob, setNotice } = useStore()
  const update = <K extends keyof Application,>(k: K, value: Application[K]) => setDraft((old) => ({ ...old, [k]: value }))
  const url = safeUrl(draft.job_url)
  const commit = async (tailor = false) => {
    if (!draft.company.trim() || !draft.role.trim()) return
    setBusy(true)
    try {
      const row = { ...draft, company: draft.company.trim(), role: draft.role.trim() }
      if (!await save('application', row)) return
      if (tailor) {
        setJob({ text: row.job_description, applicationId: row.id })
        setView('studio')
      } else setNotice('Application saved')
      close()
    } finally { setBusy(false) }
  }
  return <Modal title={isNew ? 'Add application' : application.company} close={close} drawer>
    <form className="application-form" onSubmit={(e) => { e.preventDefault(); void commit() }}>
      <div className="field-grid">
        {Object.entries(textFields).map(([key, label]) => {
          const field = key as keyof typeof textFields
          return <label key={field}>{label}<input required={field === 'company' || field === 'role'} value={draft[field]} onChange={(e) => update(field, e.target.value)}/></label>
        })}
        <label>Track<select value={draft.track} onChange={(e) => update('track', e.target.value as AppTrack)}>{appTracks.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Stage<select value={draft.stage} onChange={(e) => update('stage', e.target.value as Stage)}>{stages.map((item) => <option value={item} key={item}>{stageNames[item]}</option>)}</select></label>
        <label>Applied date<input type="date" value={draft.applied_date ?? ''} onChange={(e) => update('applied_date', e.target.value || null)}/></label>
        <label>OA deadline<input type="datetime-local" value={dateTimeInput(draft.oa_deadline)} onChange={(e) => update('oa_deadline', e.target.value ? new Date(e.target.value).toISOString() : null)}/></label>
        <label>OA platform<select value={draft.oa_platform} onChange={(e) => update('oa_platform', e.target.value)}><option value="">Select a platform</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
        {url && <button type="button" className="button field-action" onClick={() => void openLink(url)}><ExternalLink size={14}/> Open job listing</button>}
      </div>
      <label>Job description<textarea rows={5} value={draft.job_description} onChange={(e) => update('job_description', e.target.value)} placeholder="Paste a job description…"/></label>
      <button type="button" className="button" disabled={busy || !draft.job_description.trim()} onClick={(e) => {
        if (e.currentTarget.form?.reportValidity()) void commit(true)
      }}><ScanSearch size={15}/> Tailor Resume for This JD</button>
      <section className="notes">
        <div className="panel-title"><h3>Interview notes</h3><button type="button" className="button" onClick={() => setShowMarkdown(!showMarkdown)}>{showMarkdown ? 'Edit Markdown' : 'Preview Markdown'}</button></div>
        {showMarkdown ? <Suspense fallback={<p className="muted">Loading preview…</p>}><NotesPreview text={draft.notes}/></Suspense> :
          <textarea aria-label="Interview notes" rows={6} value={draft.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Use Markdown to record questions, notes, and next steps."/>}
      </section>
      {snapshot ? <SnapshotCard snapshot={snapshot} closeDrawer={close}/> : <div className="snapshot-card">
        <h3><FileLock size={15}/> Frozen resume</h3><p className="muted">Freeze a variant from the studio to record the exact resume you sent.</p>
      </div>}
      <div className="form-actions drawer-actions">
        {!isNew && <button type="button" className="button danger" onClick={() => setDecision(true)}>Delete</button>}
        <button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={busy}><Save size={15}/> Save application</button>
      </div>
    </form>
    {decision && <Modal title="Delete application?" close={() => setDecision(false)}><p className="muted">Delete {application.company} from your pipeline?</p>
      <div className="form-actions"><button className="button" onClick={() => setDecision(false)}>Cancel</button>
        <button className="button danger" onClick={async () => { if (await remove('application', application.id)) close() }}>Delete application</button></div>
    </Modal>}
  </Modal>
}

function SnapshotCard({ snapshot, closeDrawer }: { snapshot: Snapshot; closeDrawer: () => void }) {
  const [preview, setPreview] = useState(false)
  const [clone, setClone] = useState(false)
  const [name, setName] = useState(snapshot.variant_name + ' copy')
  const [busy, setBusy] = useState(false)
  const store = useStore()
  const executeClone = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const id = await invoke<string>('clone_snapshot', { id: snapshot.id, name })
      if (!await store.load()) return
      store.setVariantId(id)
      store.setJob({ text: '' })
      store.setView('studio')
      store.setNotice('Snapshot cloned into a new variant')
      closeDrawer()
    } catch (error) { store.setError(String(error)) }
    finally { setBusy(false) }
  }
  return <section className="snapshot-card">
    <h3><FileLock size={16}/> Frozen resume</h3>
    <div className="snapshot-meta"><strong>{snapshot.variant_name}</strong><span className="chip selected">{snapshot.track}</span><small>{new Date(snapshot.created_at).toLocaleString()}</small></div>
    <div className="heading-actions">
      <button type="button" className="button" onClick={() => setPreview(true)}><FileText size={14}/> Preview Frozen Resume</button>
      <button type="button" className="button" disabled={!snapshot.pdf_path} onClick={async () => {
        try { await invoke('open_snapshot_pdf', { id: snapshot.id }) }
        catch (error) { store.setError(String(error)) }
      }}><ExternalLink size={14}/> Open Saved PDF</button>
      <button type="button" className="button" onClick={() => setClone(true)}><Copy size={14}/> Clone Snapshot into New Variant</button>
    </div>
    {preview && <Modal title={snapshot.variant_name + ' · Frozen resume'} close={() => setPreview(false)} wide><Preview resume={snapshot.frozen_data_json}/></Modal>}
    {clone && <Modal title="Clone frozen resume" close={() => setClone(false)}>
      <form onSubmit={(event) => { event.stopPropagation(); void executeClone(event) }}>
        <label>Variant name<input required autoFocus value={name} onChange={(e) => setName(e.target.value)}/></label>
        <div className="form-actions"><button className="button primary" disabled={busy}><Copy size={14}/> Clone snapshot</button></div>
      </form>
    </Modal>}
  </section>
}

export function FreezeApplication({ data, variant, resume, close }: { data: Data; variant: Variant; resume: ResumeDocument; close: () => void }) {
  const store = useStore()
  const linked = data.applications.find((app) => app.id === store.job.applicationId && !app.snapshot_id)
  const untouched = () => ({ ...newApplication(), stage: 'applied' as const, track: variant.track === 'Custom' ? 'Other' as const : variant.track,
    job_description: store.job.text, applied_date: localDate(), sort_order: Math.max(-1, ...data.applications.map((app) => app.sort_order)) + 1 })
  const fromExisting = (app: Application) => ({ ...app, applied_date: app.applied_date ?? localDate(), job_description: linked?.id === app.id ? store.job.text : app.job_description })
  const [draft, setDraft] = useState<Application>(() => linked ? fromExisting(linked) : untouched())
  const [linkedId, setLinkedId] = useState(linked?.id ?? '')
  const [busy, setBusy] = useState(false)
  const eligible = data.applications.filter((app) => !app.snapshot_id)
  return <Modal title="Log application and freeze resume" close={() => { if (!busy) close() }}>
    <form className="application-form" onSubmit={async (e) => {
      e.preventDefault()
      if (!draft.company.trim() || !draft.role.trim() || busy) return
      if (!isTauri()) return store.setError('Open the ResumeForge desktop app to save a frozen PDF.')
      setBusy(true)
      try {
        const ok = await store.refresh('freeze_application', { request: {
          variant_id: variant.id, application_id: linkedId || null,
          application: { ...draft, company: draft.company.trim(), role: draft.role.trim() }, resume, markup: paperMarkup(resume),
        } })
        if (ok) { store.setNotice('Application logged and resume frozen'); store.setView('applications'); close() }
      } finally { setBusy(false) }
    }}>
      <div className="snapshot-card"><h3><FileLock size={16}/>{variant.name}</h3><p className="muted">Save the current resume, LaTeX source, and PDF with this application.</p></div>
      {!!eligible.length && <label>Application<select value={linkedId} disabled={busy} onChange={(e) => {
        const match = eligible.find((app) => app.id === e.target.value)
        setLinkedId(match?.id ?? '')
        setDraft(match ? fromExisting(match) : untouched())
      }}><option value="">Create a new application</option>{eligible.map((app) => <option key={app.id} value={app.id}>{app.company} · {app.role}</option>)}</select></label>}
      <div className="field-grid">
        <label>Company<input required value={draft.company} disabled={busy} onChange={(e) => setDraft({ ...draft, company: e.target.value })}/></label>
        <label>Role<input required value={draft.role} disabled={busy} onChange={(e) => setDraft({ ...draft, role: e.target.value })}/></label>
        <label>Track<select value={draft.track} disabled={busy} onChange={(e) => setDraft({ ...draft, track: e.target.value as AppTrack })}>{appTracks.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Applied date<input type="date" required value={draft.applied_date ?? ''} disabled={busy} onChange={(e) => setDraft({ ...draft, applied_date: e.target.value })}/></label>
      </div>
      <div className="form-actions"><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button className="button primary" disabled={busy}>{busy ? 'Generating PDF…' : <><Check size={15}/> Log and freeze</>}</button></div>
    </form>
  </Modal>
}
