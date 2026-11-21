import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Database, Download, FolderOpen, Save, Upload } from 'lucide-react'
import { Modal } from './ui'
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
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [busy, setBusy] = useState(false)
  const refresh = useStore((s) => s.refresh)
  const [installed, setInstalled] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    if (isTauri()) invoke<string | null>('check_pdflatex', { path }).then((result) => {
      if (current) setInstalled(result)
    }).catch((error) => { if (current) fail(String(error)) })
    return () => { current = false }
  }, [path, fail])
  const exportData = async (format: 'json' | 'csv') => {
    if (!isTauri()) return fail('Open the desktop app to export workspace data.')
    setBusy(true)
    try {
      const output = await invoke<string | null>('export_workspace', { format })
      if (output) notice(format === 'json' ? 'Workspace backup exported' : 'Applications CSV exported', output)
    } catch (error) { fail(String(error)) }
    finally { setBusy(false) }
  }
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
    <section className="panel settings-panel">
      <div className="panel-title"><h2 className="flex items-center gap-2"><Database size={17}/> Data portability</h2></div>
      <p className="muted">A JSON backup includes your data and saved snapshot PDFs.</p>
      <div className="heading-actions mt-3">
        <button className="button" disabled={busy} onClick={() => void exportData('json')}><Download size={15}/> Export JSON backup</button>
        <button className="button" disabled={busy} onClick={() => setConfirmRestore(true)}><Upload size={15}/> Restore from JSON</button>
        <button className="button" disabled={busy} onClick={() => void exportData('csv')}><Download size={15}/> Export applications CSV</button>
      </div>
    </section>
    {confirmRestore && <Modal title="Restore workspace?" close={() => { if (!busy) setConfirmRestore(false) }}>
      <p className="muted">The backup replaces your current workspace, including applications and frozen PDFs.</p>
      <div className="form-actions"><button className="button" disabled={busy} onClick={() => setConfirmRestore(false)}>Cancel</button>
        <button className="button danger" disabled={busy} onClick={async () => {
          if (!isTauri()) { setConfirmRestore(false); return fail('Open the desktop app to restore a backup.') }
          setBusy(true)
          try {
            const current = useStore.getState().data
            if (!await refresh('restore_workspace', {})) return
            const next = useStore.getState().data
            const get = (key: string, fallback = '') => next.settings.find((row) => row.key === key)?.value ?? fallback
            setEngine(get('pdf_engine', 'builtin'))
            setDirectory(get('default_export_dir'))
            setPattern(get('filename_pattern', defaultPattern))
            setPath(get('pdflatex_path'))
            if (JSON.stringify(next) !== JSON.stringify(current)) {
              useStore.getState().setJob({ text: '' })
              useStore.getState().setVariantId('')
              notice('Workspace restored')
            }
          } finally { setBusy(false); setConfirmRestore(false) }
        }}>{busy ? 'Restoring…' : 'Choose backup and restore'}</button></div>
    </Modal>}
  </div>
}
