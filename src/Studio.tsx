import { useState } from 'react'
import { BookOpen, BriefcaseBusiness, ChevronDown, CircleCheck, Code2, Copy, Download, FileText, FolderGit2, GraduationCap, Layers3, ListChecks, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { exportResume } from './exports'
import { ItemEditor } from './Bank'
import sample from './data/sample.json'
import { emptyData, roleTracks, sectionNames, type Data, type Item, type SectionKey, type Variant, type VariantConfig, type VariantTrack } from './model'
import { Preview } from './Preview'
import { buildResume, newConfig, orderedRows, selectTrack, toggleBullet, toggleItem, toggleSkill } from './resume'
import { useStore } from './store'
import { Modal, SortableList } from './ui'

const sectionIcons = {
  education: GraduationCap, experience: BriefcaseBusiness, projects: FolderGit2,
  leadership: Layers3, publications: BookOpen, skills: Code2,
}
const sampleData = { ...emptyData, ...sample } as Data

export function Studio() {
  const data = useStore((s) => s.data)
  const save = useStore((s) => s.save)
  const seed = useStore((s) => s.seed)
  const setView = useStore((s) => s.setView)
  const [variantId, setVariantId] = useState('')
  const [catalog, setCatalog] = useState(false)
  const [dialog, setDialog] = useState<'create' | 'clone' | 'rename' | 'delete'>()
  const variant = data.resume_variants.find((item) => item.id === variantId) ?? data.resume_variants[0]
  const remove = useStore((s) => s.remove)
  const onboarding = !variant && !data.settings.some(({ key }) => key === 'onboarded') && !data.master_items.length && !data.profile[0]?.full_name
  const demo = sampleData.resume_variants[0]
  return <div className="view studio-view">
    <header className="page-heading studio-heading"><div><h1>Variant Studio</h1><p>Tailor your resume for each application.</p></div>{variant && <ExportActions variant={variant} data={data}/>}</header>
    <div className="variant-toolbar panel">
      <div className="variant-main">
        <span className="variant-icon"><FileText size={19}/></span>
        <label className="variant-select"><span>RESUME VARIANT</span><select aria-label="Resume variant" value={variant?.id ?? ''} onChange={(e) => setVariantId(e.target.value)}>
          {!variant && <option value="">{onboarding ? demo.name : 'No variants yet'}</option>}
          {data.resume_variants.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>
        {(variant || onboarding) && <span className="chip selected">{variant?.track ?? demo.track}</span>}
      </div>
      <div className="variant-actions">
        <button className="button" onClick={() => setDialog('create')}><Plus size={15}/> New variant</button>
        {variant && <details className="variant-menu" open={catalog} onToggle={(e) => setCatalog(e.currentTarget.open)}>
          <summary className="button" aria-label="Variant actions"><ChevronDown size={15}/></summary>
          <div className="panel actions-menu">
            <button onClick={() => { setDialog('clone'); setCatalog(false) }}><Copy size={14}/> Clone</button>
            <button onClick={() => { setDialog('rename'); setCatalog(false) }}><Pencil size={14}/> Rename or change track</button>
            <button className="danger" onClick={() => { setDialog('delete'); setCatalog(false) }}><Trash2 size={14}/> Delete</button>
          </div>
        </details>}
      </div>
    </div>
    {variant ? <VariantWorkspace key={variant.id} variant={variant} data={data}/> :
      <div className="studio-grid">
        <section className="panel start-panel">
          <div className="start-icon"><Sparkles size={23}/></div>
          <h2>{onboarding ? 'Build your first resume' : 'Create a resume variant'}</h2>
          <p>{onboarding ? 'Explore a sample Computer Engineering profile with projects, skills, and internship applications.' : 'Choose entries from your Master Bank to build a resume for a specific role.'}</p>
          {onboarding ? <div className="start-actions"><button className="button primary" onClick={() => void seed()}>Load Sample CE Student Profile</button>
            <button className="button" onClick={async () => { if (await save('setting', { key: 'onboarded', value: 'true' })) setView('bank') }}>Start Blank</button></div> :
            <div className="start-actions"><button className="button primary" onClick={() => setDialog('create')}><Plus size={15}/> New variant</button>
              <button className="button" onClick={() => setView('bank')}>Open Master Bank</button></div>}
          {onboarding && <div className="demo-info"><CircleCheck size={15}/> Includes two variants and five sample applications.</div>}
        </section>
        <Preview resume={onboarding ? buildResume(sampleData, demo.config_json) : buildResume(data, newConfig())}>
          {onboarding && <span>Sample resume · Jake’s template</span>}
        </Preview>
      </div>}
    {dialog === 'delete' && variant && <Modal title="Delete variant?" close={() => setDialog(undefined)}>
      <p className="muted">Delete {variant.name} from Variant Studio?</p>
      <div className="form-actions"><button className="button" onClick={() => setDialog(undefined)}>Cancel</button>
        <button className="button danger" onClick={async () => { if (await remove('variant', variant.id)) setDialog(undefined) }}>Delete variant</button></div>
    </Modal>}
    {dialog && dialog !== 'delete' && <VariantForm mode={dialog} variant={variant} close={() => setDialog(undefined)} saved={(id) => { setVariantId(id); setDialog(undefined) }}/>}
  </div>
}


function ExportActions({ variant, data }: { variant: Variant; data: Data }) {
  const [exporting, setExporting] = useState(false)
  const run = async (format: 'pdf' | 'tex') => {
    setExporting(true)
    try { await exportResume(format, buildResume(data, variant.config_json), variant.name) }
    finally { setExporting(false) }
  }
  return <div className="heading-actions">
    <button className="button" disabled={exporting} onClick={() => void run('tex')}><Code2 size={15}/> Export .tex</button>
    <button className="button primary" disabled={exporting} onClick={() => void run('pdf')}><Download size={15}/> Export PDF</button>
  </div>
}

function VariantForm({ mode, variant, close, saved }: { mode: 'create' | 'clone' | 'rename'; variant?: Variant; close: () => void; saved: (id: string) => void }) {
  const [name, setName] = useState(mode === 'clone' ? `${variant?.name} copy` : mode === 'rename' ? variant?.name ?? '' : '')
  const [track, setTrack] = useState<VariantTrack>(mode === 'create' ? 'Custom' : variant?.track ?? 'Custom')
  const save = useStore((s) => s.save)
  return <Modal title={mode === 'rename' ? 'Edit variant' : mode === 'clone' ? 'Clone variant' : 'Create variant'} close={close}>
    <form onSubmit={async (e) => {
      e.preventDefault()
      if (!name.trim()) return
      const existing = mode === 'rename' ? variant : undefined
      const id = existing?.id ?? crypto.randomUUID()
      if (await save('variant', { id, name: name.trim(), track, config_json: mode === 'create' ? newConfig() : variant?.config_json ?? newConfig(),
        created_at: existing?.created_at ?? '', updated_at: '' })) saved(id)
    }}>
      <div className="field-grid"><label>Variant name<input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Platform Engineering Intern"/></label>
      <label>Track<select value={track} onChange={(e) => setTrack(e.target.value as VariantTrack)}>{[...roleTracks, 'Custom'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="form-actions"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary">Save variant</button></div>
    </form>
  </Modal>
}

function VariantWorkspace({ variant, data }: { variant: Variant; data: Data }) {
  const [config, setConfig] = useState(variant.config_json)
  const [expanded, setExpanded] = useState<SectionKey[]>(['education', 'experience', 'projects'])
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [editing, setEditing] = useState<Item>()
  const [naming, setNaming] = useState<SectionKey>()
  const save = useStore((s) => s.save)
  const setView = useStore((s) => s.setView)
  const update = (next: VariantConfig, track = variant.track) => {
    setConfig(next)
    void save('variant', { ...variant, track, config_json: next }).then((ok) => { if (!ok) setConfig(useStore.getState().data.resume_variants.find((v) => v.id === variant.id)?.config_json ?? variant.config_json) })
  }
  const doc = buildResume(data, config)
  return <div className="studio-grid">
    <div className="studio-controls">
      <section className="panel track-panel">
        <div className="track-heading"><Sparkles size={16}/><h2>Track auto-select</h2></div>
        <p className="muted">Select entries and alternate bullets for a role.</p>
        <div className="track-actions">{roleTracks.map((track) => <button className={track === variant.track ? 'chip selected' : 'chip'} key={track} onClick={() => update(selectTrack(data, config, track), track)} aria-label={`Apply ${track} Track`}>{track}</button>)}</div>
      </section>
      <section className="panel structure-panel">
        <div className="studio-tabs"><span><ListChecks size={16}/> Resume content</span></div>
        <div className="structure-header"><h3>Sections</h3><span className="muted">{doc.sections.length} included</span></div>
        <SortableList rows={config.section_order.map((id) => ({ id }))} reorder={(ordered) => update({ ...config, section_order: ordered.map(({ id }) => id) })}>
        {({ id: key }, grip) => {
          const isOpen = expanded.includes(key)
          const rows = key === 'skills' ? [] : orderedRows(data.master_items.filter((item) => item.section === key), config.selected_items.map((item) => item.item_id))
          const count = key === 'skills' ? data.master_skills.length : rows.length
          const used = key === 'skills' ? doc.sections.find((section) => section.key === key)?.skills.reduce((sum, category) => sum + category.skills.length, 0) ?? 0 : rows.filter((item) => config.selected_items.some((selection) => selection.item_id === item.id)).length
          const Icon = sectionIcons[key]
          return <div className="structure-section">
            <div className="section-head">{grip}
              <button className="section-toggle" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? expanded.filter((item) => item !== key) : [...expanded, key])}>
                <span className="section-icon"><Icon size={15}/></span><strong>{config.section_titles[key] || sectionNames[key]}</strong>
                <span className={used ? 'section-count has-items' : 'section-count'}>{used}/{count}</span><ChevronDown size={14} className={isOpen ? 'rotated' : ''}/>
              </button>
              <button className="icon-button" onClick={() => setNaming(key)} aria-label={`Rename ${sectionNames[key]} section`} title="Rename section"><Pencil size={12}/></button>
            </div>
            {isOpen && <div className="section-rows">
              {!count && <button className="empty section-empty" onClick={() => setView('bank')}>Add entries in the Master Bank</button>}
              {key === 'skills' ? <Skills data={data} config={config} update={update}/> : <SortableList rows={rows} reorder={(items) => {
                const other = config.selected_items.filter((item) => !rows.some((row) => row.id === item.item_id))
                const ordered = items.flatMap((row) => config.selected_items.filter((item) => item.item_id === row.id))
                update({ ...config, selected_items: [...other, ...ordered] })
              }}>{(item, itemGrip) => {
                const itemSelection = config.selected_items.find((row) => row.item_id === item.id)
                const bullets = orderedRows(data.master_bullets.filter((bullet) => bullet.item_id === item.id), itemSelection?.bullet_ids ?? [])
                const bulletsOpen = expandedItems.includes(item.id)
                return <div className="structure-item">
                  <div className="structure-item-row">{itemGrip}
                    <label className="check-row"><input type="checkbox" checked={!!itemSelection} onChange={(e) => update(toggleItem(config, item.id, e.target.checked, bullets.map((bullet) => bullet.id)))}/><span>{item.title}<small>{item.subtitle}</small></span></label>
                    <button className="icon-button" aria-label={`Quick edit ${item.title}`} title="Quick edit" onClick={() => setEditing(item)}><Pencil size={13}/></button>
                    {bullets.length > 0 && <button className="section-count" aria-expanded={bulletsOpen} aria-label={`Toggle bullets for ${item.title}`} onClick={() => setExpandedItems(bulletsOpen ? expandedItems.filter((id) => id !== item.id) : [...expandedItems, item.id])}>{itemSelection?.bullet_ids.length ?? 0}/{bullets.length}<ChevronDown size={12} className={bulletsOpen ? 'rotated' : ''}/></button>}
                  </div>
                  {bulletsOpen && <div className="structure-bullets"><SortableList rows={bullets} reorder={(sorted) => {
                    if (itemSelection) update({ ...config, selected_items: config.selected_items.map((row) => row.item_id === item.id
                      ? { ...row, bullet_ids: sorted.map((bullet) => bullet.id).filter((id) => row.bullet_ids.includes(id)) } : row) })
                  }}>{(bullet, bulletGrip) => <div className="structure-item-row">
                    {bulletGrip}<label className="check-row"><input type="checkbox" checked={itemSelection?.bullet_ids.includes(bullet.id) ?? false} onChange={(e) => update(toggleBullet(config, item.id, bullet.id, e.target.checked))}/><span>{bullet.content.replace(/\*\*/g, '')}</span></label>
                  </div>}</SortableList></div>}
                </div>
              }}</SortableList>}
            </div>}
          </div>
        }}</SortableList>
      </section>
    </div>
    <Preview resume={doc} controls={{ config, update }}/>
    {editing && <ItemEditor item={editing} bullets={data.master_bullets.filter((bullet) => bullet.item_id === editing.id)} close={() => setEditing(undefined)}/>}
    {naming && <SectionTitle title={config.section_titles[naming] || sectionNames[naming]} close={() => setNaming(undefined)} save={(title) => {
      update({ ...config, section_titles: { ...config.section_titles, [naming]: title } })
      setNaming(undefined)
    }}/>}
  </div>
}

function SectionTitle({ title, close, save }: { title: string; close: () => void; save: (value: string) => void }) {
  const [value, setValue] = useState(title)
  return <Modal title="Section title" close={close}><form onSubmit={(e) => { e.preventDefault(); save(value.trim()) }}>
    <label>Title<input value={value} onChange={(e) => setValue(e.target.value)} autoFocus/></label><div className="form-actions"><button className="button primary">Save title</button></div>
  </form></Modal>
}

function Skills({ data, config, update }: { data: Data; config: VariantConfig; update: (config: VariantConfig) => void }) {
  return <SortableList rows={orderedRows(data.skill_categories, config.selected_skills.map((category) => category.category_id))} reorder={(rows) => {
    update({ ...config, selected_skills: rows.flatMap((row) => config.selected_skills.filter((category) => category.category_id === row.id)) })
  }}>{(category, grip) => {
    const selection = config.selected_skills.find((row) => row.category_id === category.id)
    const skills = orderedRows(data.master_skills.filter((skill) => skill.category_id === category.id), selection?.skill_ids ?? [])
    return <div className="structure-item">
      <div className="structure-item-row">{grip}<strong>{category.name}</strong></div>
      <div className="structure-bullets"><SortableList rows={skills} reorder={(rows) => update({
        ...config, selected_skills: config.selected_skills.map((item) => item.category_id === category.id
          ? { ...item, skill_ids: rows.filter((skill) => item.skill_ids.includes(skill.id)).map((skill) => skill.id) } : item),
      })}>{(skill, skillGrip) => <div className="structure-item-row">{skillGrip}<label className="check-row">
        <input type="checkbox" checked={selection?.skill_ids.includes(skill.id) ?? false} onChange={(e) => update(toggleSkill(config, category.id, skill.id, e.target.checked))}/>{skill.name}
      </label></div>}</SortableList></div>
    </div>
  }}</SortableList>
}
