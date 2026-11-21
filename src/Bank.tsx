import { useState, type ReactNode } from 'react'
import { ChevronRight, Plus, Save, Trash2 } from 'lucide-react'
import { lintBullet } from './linter'
import { emptyProfile, sectionNames, sections, type Bullet, type Category, type Item, type Profile, type Section, type Skill } from './model'
import { useStore } from './store'
import { Modal, SortableList, TrackPicker } from './ui'

const profileFields = {
  full_name: 'Full name', phone: 'Phone', email: 'Email', location: 'Location',
  linkedin_url: 'LinkedIn URL', linkedin_display: 'LinkedIn display text',
  github_url: 'GitHub URL', github_display: 'GitHub display text',
  portfolio_url: 'Portfolio URL', portfolio_display: 'Portfolio display text',
} as const
const itemFields = {
  title: 'Title', subtitle: 'Subtitle', location: 'Location', date_range: 'Date range',
  url: 'Link URL', extra_line: 'Extra line / coursework',
} as const

function addItem(section: Section, sort_order: number): Item {
  return { id: crypto.randomUUID(), section, title: '', subtitle: '', location: '', date_range: '', url: '', extra_line: '', tags_json: [], sort_order, updated_at: '' }
}

export function Bank() {
  const data = useStore((s) => s.data)
  const save = useStore((s) => s.save)
  const remove = useStore((s) => s.remove)
  const notice = useStore((s) => s.setNotice)
  const [tab, setTab] = useState<Section | 'profile' | 'skills'>('profile')
  const [editing, setEditing] = useState<Item>()
  const [confirmation, setConfirmation] = useState<{ title: string; run: () => Promise<boolean> }>()
  const rows = data.master_items.filter((item) => item.section === tab)
  const confirm = (title: string, run: () => Promise<boolean>) => setConfirmation({ title, run })
  return <div className="view">
    <header className="page-heading"><h1>Master Bank</h1><p>Manage the reusable content behind every resume.</p></header>
    <div className="bank-grid">
      <nav className="panel bank-nav" aria-label="Master Bank sections">
        {(['profile', ...sections, 'skills'] as const).map((key) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
          {key === 'profile' ? 'Profile Header' : sectionNames[key]}<ChevronRight size={15}/>
        </button>)}
      </nav>
      <section className="panel bank-content" aria-label="Editor">
        <div className="panel-title">
          <h2>{tab === 'profile' ? 'Profile Header' : sectionNames[tab]}</h2>
          {tab !== 'profile' && tab !== 'skills' && <button className="button primary" onClick={() => setEditing(addItem(tab, Math.max(-1, ...rows.map((row) => row.sort_order)) + 1))}><Plus size={16}/> Add entry</button>}
        </div>
        {tab === 'profile' && <ProfileEditor key={JSON.stringify(data.profile[0])} profile={data.profile[0] ?? emptyProfile}/>}
        {tab === 'skills' && <SkillsEditor confirm={confirm}/>}
        {tab !== 'profile' && tab !== 'skills' && <>
          {!rows.length && <div className="empty">Add an entry to build your {sectionNames[tab].toLowerCase()} section.</div>}
          <SortableList rows={rows} reorder={(ordered) => void save('item', ...ordered.map((item, sort_order) => ({ ...item, sort_order })))}>
            {(item, grip) => <div className="list-row">
              {grip}<button className="row-main" onClick={() => setEditing(item)}><strong>{item.title}</strong><small>{item.subtitle}</small></button>
              <span className="muted">{data.master_bullets.filter((bullet) => bullet.item_id === item.id).length} bullets</span>
              <button className="icon-button danger" title="Delete entry" aria-label={`Delete ${item.title}`} onClick={() => confirm(item.title, () => remove('item', item.id))}><Trash2 size={16}/></button>
            </div>}
          </SortableList>
        </>}
      </section>
    </div>
    {editing && <ItemEditor item={editing} bullets={data.master_bullets.filter((bullet) => bullet.item_id === editing.id)} close={() => setEditing(undefined)}/>}
    {confirmation && <Modal title="Delete entry?" close={() => setConfirmation(undefined)}>
      <p className="muted">Delete {confirmation.title} from the Master Bank?</p>
      <div className="form-actions"><button className="button" onClick={() => setConfirmation(undefined)}>Cancel</button>
        <button className="button danger" onClick={async () => { if (await confirmation.run()) { setConfirmation(undefined); notice('Entry deleted') } }}>Delete</button></div>
    </Modal>}
  </div>
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const [draft, setDraft] = useState(profile)
  const save = useStore((s) => s.save)
  const notice = useStore((s) => s.setNotice)
  return <form onSubmit={async (e) => { e.preventDefault(); if (await save('profile', draft)) notice('Profile saved') }}>
    <div className="field-grid">{Object.entries(profileFields).map(([name, label]) => {
      const key = name as keyof typeof profileFields
      return <label key={key}>{label}<input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}/></label>
    })}</div>
    <div className="form-actions"><button className="button primary"><Save size={15}/> Save profile</button></div>
  </form>
}

export function ItemEditor({ item, bullets, close }: { item: Item; bullets: Bullet[]; close: () => void }) {
  const [draft, setDraft] = useState(item)
  const [entries, setEntries] = useState(bullets)
  const [busy, setBusy] = useState(false)
  const notice = useStore((s) => s.setNotice)
  const save = useStore((s) => s.save)
  const remove = useStore((s) => s.remove)
  return <Modal title={item.title ? 'Edit resume entry' : 'Add resume entry'} close={close} wide>
    <form onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      try {
        if (!await save('item', { ...draft, title: draft.title.trim() })) return
        if (entries.length && !await save('bullet', ...entries.map((bullet, sort_order) => ({ ...bullet, sort_order })))) return
        for (const bullet of bullets.filter((bullet) => !entries.some((entry) => entry.id === bullet.id))) {
          if (!await remove('bullet', bullet.id)) return
        }
        notice('Resume entry saved')
        close()
      } finally { setBusy(false) }
    }}>
      <div className="field-grid">{Object.entries(itemFields).map(([name, label]) => {
        const key = name as keyof typeof itemFields
        return <label key={key}>{label}<input required={key === 'title'} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}/></label>
      })}</div>
      <p className="field-label">Entry tracks</p><TrackPicker selected={draft.tags_json} change={(tags_json) => setDraft({ ...draft, tags_json })}/>
      <div className="panel-title bullet-title"><h3>Alternate bullets</h3><button type="button" className="button" onClick={() => setEntries([...entries, { id: crypto.randomUUID(), item_id: item.id, content: '', tracks_json: ['General'], sort_order: entries.length }])}><Plus size={15}/> Add bullet</button></div>
      <SortableList rows={entries} reorder={setEntries}>{(bullet, grip) => {
        const editBullet = (next: Bullet) => setEntries(entries.map((entry) => entry.id === next.id ? next : entry))
        return <div className="bullet-edit">
          <div className="bullet-input">{grip}<textarea required aria-label="Bullet text" placeholder="Use **bold** to emphasize a metric" value={bullet.content} onChange={(e) => editBullet({ ...bullet, content: e.target.value })}/>
            <button type="button" className="icon-button danger" aria-label="Remove bullet" onClick={() => setEntries(entries.filter((entry) => entry.id !== bullet.id))}><Trash2 size={15}/></button>
          </div>
          <div className="bullet-meta"><TrackPicker selected={bullet.tracks_json} change={(tracks_json) => editBullet({ ...bullet, tracks_json })}/>{lintBullet(bullet.content).map((hint) => <span className="chip warning" key={hint}>{hint}</span>)}</div>
        </div>
      }}</SortableList>
      <div className="form-actions"><button type="button" className="button" onClick={close}>Cancel</button><button disabled={busy} className="button primary"><Save size={15}/> Save entry</button></div>
    </form>
  </Modal>
}

type Confirm = (title: string, run: () => Promise<boolean>) => void
function SkillsEditor({ confirm }: { confirm: Confirm }) {
  const data = useStore((s) => s.data)
  const save = useStore((s) => s.save)
  const remove = useStore((s) => s.remove)
  const [edit, setEdit] = useState<{ category: Category; skill?: Skill }>()
  return <>
    <div className="section-toolbar"><button className="button primary" onClick={() => setEdit({ category: { id: crypto.randomUUID(), name: '', sort_order: Math.max(-1, ...data.skill_categories.map((c) => c.sort_order)) + 1 } })}><Plus size={15}/> Add category</button></div>
    {!data.skill_categories.length && <div className="empty">Create a category to organize your skills.</div>}
    <SortableList rows={data.skill_categories} reorder={(rows) => void save('category', ...rows.map((c, sort_order) => ({ ...c, sort_order })))}>
      {(category, grip) => {
        const skills = data.master_skills.filter((skill) => skill.category_id === category.id)
        return <div className="skill-group"><div className="list-row">
          {grip}<button className="row-main" onClick={() => setEdit({ category })}><strong>{category.name}</strong></button>
          <button className="button" onClick={() => setEdit({ category, skill: { id: crypto.randomUUID(), category_id: category.id, name: '', tracks_json: ['General'], sort_order: Math.max(-1, ...skills.map((s) => s.sort_order)) + 1 } })}><Plus size={15}/> Add skill</button>
          <button className="icon-button danger" aria-label={`Delete ${category.name}`} onClick={() => confirm(category.name, () => remove('category', category.id))}><Trash2 size={15}/></button>
        </div>
          <SortableList rows={skills} reorder={(rows) => void save('skill', ...rows.map((skill, sort_order) => ({ ...skill, sort_order })))}>
            {(skill, skillGrip) => <div className="list-row nested">{skillGrip}<button className="row-main" onClick={() => setEdit({ category, skill })}>{skill.name}</button>
              {skill.tracks_json.map((track) => <span className="chip" key={track}>{track}</span>)}
              <button className="icon-button danger" aria-label={`Delete ${skill.name}`} onClick={() => confirm(skill.name, () => remove('skill', skill.id))}><Trash2 size={15}/></button>
            </div>}
          </SortableList>
        </div>
      }}
    </SortableList>
    {edit && <Modal title={edit.skill ? 'Skill' : 'Skill category'} close={() => setEdit(undefined)}>
      <form onSubmit={async (e) => { e.preventDefault(); if (await (edit.skill ? save('skill', edit.skill) : save('category', edit.category))) setEdit(undefined) }}>
        <label>Name<input required value={edit.skill?.name ?? edit.category.name} onChange={(e) => setEdit(edit.skill ? { ...edit, skill: { ...edit.skill, name: e.target.value } } : { category: { ...edit.category, name: e.target.value } })}/></label>
        {edit.skill && <div className="mt-4"><TrackPicker selected={edit.skill.tracks_json} change={(tracks_json) => {
          if (edit.skill) setEdit({ ...edit, skill: { ...edit.skill, tracks_json } })
        }}/></div>}
        <div className="form-actions"><button className="button primary" type="submit">Save</button></div>
      </form>
    </Modal>}
  </>
}

export function Onboarding({ children }: { children?: ReactNode }) {
  const save = useStore((s) => s.save)
  const seed = useStore((s) => s.seed)
  const setView = useStore((s) => s.setView)
  return <section className="panel welcome">
    <div className="welcome-icon"><Plus size={26}/></div>
    <h2>Build your first resume</h2>
    <p>Load a sample Computer Engineering profile with projects, variants, and applications, or start with your own experience.</p>
    <div className="flex flex-wrap justify-center gap-3">
      <button className="button primary" onClick={() => void seed()}>Load Sample CE Student Profile</button>
      <button className="button" onClick={async () => { if (await save('setting', { key: 'onboarded', value: 'true' })) setView('bank') }}>Start Blank</button>
    </div>
    {children}
  </section>
}
