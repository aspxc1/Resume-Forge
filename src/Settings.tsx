import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { FolderOpen, Save } from 'lucide-react'
import { useStore } from './store'

const defaultPattern = '{FirstName}_{LastName}_{Company}_{Role}'
export function Settings() {
  const settings = useStore((s) => s.data.settings)
  const save = useStore((s) => s.save)
  const notice = useStore((s) => s.setNotice)
  const fail = useStore((s) => s.setError)
  const setting = (key: string, fallback = '') => settings.find((entry) => entry.key === key)?.value ?? fallback
  const [engine, setEngine] = useState(setting('pdf_engine', 'builtin'))
  const [directory, setDirectory] = useState(setting('default_export_dir'))
  const [pattern, setPattern] = useState(setting('filename_pattern', defaultPattern))
  const [path, setPath] = useState(setting('pdflatex_path'))
  const [installed, setInstalled] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    if (isTauri()) invoke<string | null>('check_pdflatex', { path }).then((result) => {
      if (current) setInstalled(result)
    }).catch((error) => { if (current) fail(String(error)) })
    return () => { current = false }
  }, [path, fail])
  return <div className="view settings-view">
    <header className="page-heading"><h1>Settings</h1><p>Configure PDF exports and manage your local workspace.</p></header>
    <form className="panel settings-panel" onSubmit={async (e) => {
      e.preventDefault()
      if (engine === 'pdflatex' && !installed) return fail('Locate pdflatex before selecting it as your PDF engine.')
      if (await save('setting', { key: 'pdf_engine', value: engine }, { key: 'pdflatex_path', value: path.trim() },
        { key: 'default_export_dir', value: directory.trim() }, { key: 'filename_pattern', value: pattern.trim() || defaultPattern })) notice('Export settings saved')
    }}>
      <div className="panel-title"><h2>Export preferences</h2></div>
      <div className="field-grid">
        <label>PDF engine<select value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="builtin">Built-in Instant Vector PDF</option>
          <option value="pdflatex" disabled={!installed && engine !== 'pdflatex'}>Local pdflatex (Compiles .tex)</option>
        </select></label>
        <label>pdflatex executable<input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Detect on PATH"/>
          <small className="muted">{installed ? 'Compiler found' : 'Compiler unavailable at this location'}</small>
        </label>
        <div><label>Default export folder<input value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder="Choose at export time"/></label>
          <button type="button" className="button mt-2" onClick={async () => {
            if (!isTauri()) return fail('Open the desktop app to choose a folder.')
            try { const dir = await invoke<string | null>('pick_directory'); if (dir) setDirectory(dir) }
            catch (error) { fail(String(error)) }
          }}><FolderOpen size={15}/> Browse</button>
        </div>
        <label>Filename pattern<input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={defaultPattern}/><small className="muted">{'{FirstName}, {LastName}, {Company}, {Role}, {Variant}'}</small></label>
      </div>
      <div className="form-actions"><button type="submit" className="button primary"><Save size={15}/> Save preferences</button></div>
    </form>
  </div>
}
