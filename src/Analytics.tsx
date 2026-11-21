import { ArrowUpRight, BarChart3, BriefcaseBusiness, Layers3 } from 'lucide-react'
import { roleTracks, type Application, type Stage } from './model'
import { applied, funnel, pct, reachedByApplication, stageNames, weeklyActivity } from './pipeline'
import { useStore } from './store'

function interview(visited: Set<Stage> | undefined) {
  return visited?.has('technical') || visited?.has('final') || visited?.has('offer')
}

function summarize(label: string, rows: Application[], reached: Map<string, Set<Stage>>) {
  const submissions = rows.filter((row) => applied(row, reached.get(row.id)))
  const oa = submissions.filter((row) => reached.get(row.id)?.has('oa')).length
  const interviews = submissions.filter((row) => interview(reached.get(row.id))).length
  return { label, total: submissions.length, oa: pct(oa, submissions.length), interview: pct(interviews, submissions.length) }
}

function Performance({ title, rows }: { title: string; rows: ReturnType<typeof summarize>[] }) {
  return <section className="panel analytics-panel">
    <div className="panel-title"><h2>{title}</h2></div>
    <div className="table-scroll"><table className="data-table analytics-table">
      <thead><tr><th>Group</th><th>Applications</th><th>OA rate</th><th>Interview rate</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label}>
        <th scope="row">{row.label}</th><td>{row.total}</td><td>{row.total ? row.oa + '%' : '—'}</td><td>{row.total ? row.interview + '%' : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

export function Analytics() {
  const { applications, application_stage_events, resume_snapshots, resume_variants } = useStore((s) => s.data)
  const reached = reachedByApplication(applications, application_stage_events)
  const submitted = applications.filter((app) => applied(app, reached.get(app.id)))
  const active = applications.filter((app) => ['applied', 'oa', 'technical', 'final'].includes(app.stage)).length
  const responses = submitted.filter((app) => {
    const visited = reached.get(app.id)
    return interview(visited) || visited?.has('oa') || visited?.has('rejected')
  }).length
  const weeks = weeklyActivity(submitted)
  const peak = Math.max(1, ...weeks.map((week) => week.count))
  const snapshots = new Map(resume_snapshots.map((snapshot) => [snapshot.id, snapshot]))
  const variantRows = new Map<string, { label: string; applications: Application[] }>(resume_variants.map(({ id, name }) => [id, { label: name, applications: [] }]))
  const noSnapshot: Application[] = []
  for (const app of submitted) {
    const snapshot = snapshots.get(app.snapshot_id ?? '')
    if (!snapshot) { noSnapshot.push(app); continue }
    const key = snapshot.source_variant_id ?? snapshot.variant_name
    const group = variantRows.get(key) ?? { label: snapshot.variant_name, applications: [] }
    group.applications.push(app)
    variantRows.set(key, group)
  }
  const kpis = [
    { label: 'Total applications', value: submitted.length, detail: 'Submitted', icon: BriefcaseBusiness },
    { label: 'Active pipeline', value: active, detail: 'Applied through final', icon: Layers3 },
    { label: 'Response rate', value: pct(responses, submitted.length) + '%', detail: responses + ' employer responses', icon: ArrowUpRight },
  ]
  const trackRows = [...roleTracks, 'Other'].map((track) => summarize(track, applications.filter((app) => app.track === track), reached))
  const variantPerformance = [...variantRows.values()].map(({ label, applications }, index, groups) => {
    const name = groups.filter((group) => group.label === label).length > 1
      ? label + ' (' + (1 + groups.slice(0, index).filter((group) => group.label === label).length) + ')' : label
    return summarize(name, applications, reached)
  })
  return <div className="view">
    <header className="page-heading"><h1>Analytics</h1><p>Review application activity and callback rates.</p></header>
    <div className="kpi-grid">{kpis.map(({ label, value, detail, icon: Icon }) => <section key={label} className="panel kpi">
      <span className="kpi-icon"><Icon size={18}/></span><h2>{label}</h2><strong>{value}</strong><small>{detail}</small>
    </section>)}</div>
    <div className="analytics-grid">
      <section className="panel analytics-panel">
        <div className="panel-title"><h2>Conversion funnel</h2><BarChart3 size={17} className="muted"/></div>
        <div className="funnel">{funnel(applications, application_stage_events).map(({ stage, count, percent }) => <div className="funnel-row" key={stage}>
          <span>{stageNames[stage]}</span><div className="funnel-track"><div className={'funnel-bar ' + stage} style={{ width: percent + '%' }}/></div><strong>{count}</strong><span>{percent}%</span>
        </div>)}</div>
        <p className="muted chart-caption">Share of submitted applications that reached each stage.</p>
      </section>
      <section className="panel analytics-panel">
        <div className="panel-title"><h2>Weekly application activity</h2><span className="chip">Last 12 weeks</span></div>
        <div className="week-chart" role="img" aria-label={weeks.map((week) => week.label + ': ' + week.count).join('; ')}>
          {weeks.map(({ label, start, count }, index) => <div className="week-slot" key={start} title={'Week of ' + label + ' · ' + count + ' applications'} aria-hidden="true">
            <div className="week-col">{count > 0 && <span className="week-bar" style={{ height: count / peak * 100 + '%' }}><span>{count}</span></span>}</div>
            <span className="week-label">{index % 3 === 0 || index === 11 ? label : ''}</span>
          </div>)}
        </div>
      </section>
      <Performance title="Callback performance by track" rows={trackRows}/>
      <Performance title="Callback performance by variant" rows={[...variantPerformance, summarize('No frozen resume', noSnapshot, reached)]}/>
    </div>
  </div>
}
