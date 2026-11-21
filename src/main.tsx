import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BarChart3, BriefcaseBusiness, Check, CircleHelp, Database, FileText, FolderOpen, Layers3, Settings, X } from 'lucide-react'
import { Bank } from './Bank'
import { Studio } from './Studio'
import { Settings as SettingsView } from './Settings'
import { revealFile } from './native'
import { useStore, type View } from './store'
import './styles.css'

const links = [
  { view: 'studio', label: 'Variant Studio', icon: FileText },
  { view: 'bank', label: 'Master Bank', icon: Database },
  { view: 'applications', label: 'Applications', icon: BriefcaseBusiness },
  { view: 'analytics', label: 'Analytics', icon: BarChart3 },
  { view: 'settings', label: 'Settings', icon: Settings },
] as const

function WorkspaceView({ view }: { view: View }) {
  if (view === 'bank') return <Bank/>
  if (view === 'studio') return <Studio/>
  if (view === 'settings') return <SettingsView/>
  const label = links.find((link) => link.view === view)?.label
  return <div className="view"><header className="page-heading"><h1>{label}</h1></header></div>
}

function App() {
  const { view, setView, load, loaded, error, notice, noticePath, setError, setNotice } = useStore()
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), noticePath ? 10000 : 5500)
    return () => clearTimeout(timer)
  }, [notice, noticePath, setNotice])
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('studio')}><span className="brand-icon"><Layers3 size={22}/></span><span>Resume<span className="brand-accent">Forge</span></span></button>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Workspace">{links.filter((link) => link.view !== 'settings').map(({ view: id, label, icon: Icon }) =>
        <button key={id} className={id === view ? 'nav-link active' : 'nav-link'} aria-current={id === view ? 'page' : undefined} onClick={() => setView(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className={view === 'settings' ? 'nav-link active' : 'nav-link'} aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}><Settings size={18}/>Settings</button>
        <div className="sidebar-foot"><CircleHelp size={15}/><span>Local workspace</span><span className="status-dot"/></div>
      </div>
    </aside>
    <main className="workspace">
      <div className="workspace-bar"><span>Workspace</span><span className="crumb">/</span><strong>{links.find((link) => link.view === view)?.label}</strong><span className="local-label"><span className="status-dot"/> Local storage</span></div>
      {loaded ? <WorkspaceView view={view}/> : <div className="empty">{error ? <button className="button" onClick={() => void load()}>Retry loading workspace</button> : 'Loading workspace…'}</div>}
    </main>
    {(error || notice) && <div className={error ? 'toast error' : 'toast'} role={error ? 'alert' : 'status'}>{!error && <Check size={17}/>}<span>{error || notice}</span>{!error && noticePath && <button className="button" onClick={() => void revealFile(noticePath)}><FolderOpen size={14}/> Open Containing Folder</button>}<button className="icon-button" title="Dismiss" aria-label="Dismiss" onClick={() => error ? setError('') : setNotice('')}><X size={16}/></button></div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App/>)
