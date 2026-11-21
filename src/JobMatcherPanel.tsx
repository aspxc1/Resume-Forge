import { useMemo, useState } from 'react'
import { Check, CircleAlert, Plus, Search, X } from 'lucide-react'
import { matchJob, type KeywordResult, type Source } from './matcher'
import { type Data, type ResumeDocument } from './model'
import { InlineBold } from './Paper'
import { useStore } from './store'

const buckets = [
  { status: 'active', title: 'In active resume', style: 'success', icon: Check },
  { status: 'available', title: 'Available in Master Bank', style: 'warning', icon: Plus },
  { status: 'missing', title: 'Not in Master Bank', style: 'error', icon: CircleAlert },
] as const

function readCustom(value: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === 'string') : []
  } catch { return [] }
}

export function Matcher({ data, resume, include }: { data: Data; resume: ResumeDocument; include: (source: Source) => void }) {
  const job = useStore((s) => s.job)
  const setJob = useStore((s) => s.setJob)
  const save = useStore((s) => s.save)
  const setting = data.settings.find(({ key }) => key === 'custom_keywords')?.value
  const custom = useMemo(() => readCustom(setting), [setting])
  const [word, setWord] = useState('')
  const [open, setOpen] = useState('')
  const results = useMemo(() => matchJob(job.text, resume, data, custom), [job.text, resume, data, custom])
  const active = results.filter(({ status }) => status === 'active').length
  const percent = results.length ? Math.round(active / results.length * 100) : 0
  const linked = data.applications.find(({ id }) => id === job.applicationId)
  const options = data.applications.filter((app) => app.stage === 'wishlist' || app.id === linked?.id)
  const persist = (words: string[]) => save('setting', { key: 'custom_keywords', value: JSON.stringify(words) })
  return <div className="matcher" id="matcher-panel" role="tabpanel" aria-labelledby="matcher-tab">
    <label>Load an application JD<select value={linked?.id ?? ''} onChange={(e) => {
      const app = data.applications.find(({ id }) => id === e.target.value)
      setJob(app ? { text: app.job_description, applicationId: app.id } : { text: job.text })
    }}><option value="">Paste a job description</option>{options.map((app) => <option value={app.id} key={app.id}>{app.company} · {app.role}</option>)}</select></label>
    <label>Job description<textarea rows={7} placeholder="Paste the job description here…" value={job.text} onChange={(e) => setJob({ ...job, text: e.target.value })}/></label>
    <details className="matcher-custom">
      <summary className="button"><Plus size={14}/> Custom keywords {custom.length ? `(${custom.length})` : ''}</summary>
      <form className="inline-form" onSubmit={async (e) => {
        e.preventDefault()
        const value = word.trim()
        if (!value || custom.some((term) => term.toLowerCase() === value.toLowerCase())) return
        if (await persist([...custom, value])) setWord('')
      }}><input aria-label="Custom keyword" placeholder="e.g. NVIDIA Isaac" maxLength={80} value={word} onChange={(e) => setWord(e.target.value)}/><button className="button" disabled={!word.trim()}>Add</button></form>
      <div className="flex flex-wrap gap-2">{custom.map((term) => <button className="chip" key={term} aria-label={`Remove ${term}`} onClick={() => void persist(custom.filter((value) => value !== term))}>{term}<X size={11}/></button>)}</div>
    </details>
    {!results.length ? <div className="empty matcher-empty"><Search size={18}/>{job.text.trim() ? 'No dictionary or custom keywords found.' : 'Paste a job description to see keyword coverage.'}</div> : <>
      <div className="coverage" aria-live="polite">
        <div><strong>{percent}%</strong><span>Keyword coverage</span></div><span>{active} / {results.length} matched</span>
        <progress max={results.length} value={active} aria-label="Keyword coverage"/>
      </div>
      {buckets.map(({ status, title, style, icon: Icon }) => {
        const keywords = results.filter((result) => result.status === status)
        return <section className="keyword-bucket" key={status} aria-label={title}>
          <h3><Icon size={15}/>{title}<span className="section-count">{keywords.length}</span></h3>
          <div className="keyword-chips">{keywords.length ? keywords.map((result) => result.status === 'available'
            ? <button className={`chip ${style}`} aria-expanded={open === result.name} onClick={() => setOpen(open === result.name ? '' : result.name)} key={result.name}>{result.name}<Plus size={11}/></button>
            : <span className={`chip ${style}`} key={result.name}>{result.name}</span>) : <span className="muted">None</span>}</div>
          {status === 'available' && keywords.find((result) => result.name === open) && <Sources result={keywords.find((result) => result.name === open)!} include={(source) => { include(source); setOpen('') }}/>}
        </section>
      })}
    </>}
  </div>
}

function Sources({ result, include }: { result: KeywordResult; include: (source: Source) => void }) {
  return <div className="keyword-sources">
    {result.sources.map((source) => <div className="keyword-source" key={source.kind + source.id}>
      <div><strong>{source.label}</strong>{source.kind === 'bullet' && <p><InlineBold text={source.text}/></p>}</div>
      <button className="button" onClick={() => include(source)}><Plus size={14}/> Include in Variant</button>
    </div>)}
  </div>
}
