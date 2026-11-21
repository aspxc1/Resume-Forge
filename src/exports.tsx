import { renderToStaticMarkup } from 'react-dom/server'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Paper } from './Paper'
import { type ResumeDocument } from './model'
import { useStore } from './store'

export function paperMarkup(resume: ResumeDocument) {
  return renderToStaticMarkup(<Paper resume={resume} interactive={false}/>)
}

export async function exportResume(format: 'pdf' | 'tex', resume: ResumeDocument, variant: string, company = '', role = '') {
  const store = useStore.getState()
  try {
    if (!isTauri()) throw new Error('Open the ResumeForge desktop app to export a file.')
    const path = await invoke<string | null>('export_resume', {
      request: { format, resume, variant, company, role, markup: format === 'pdf' ? paperMarkup(resume) : '' },
    })
    if (path) store.setNotice(format === 'pdf' ? 'PDF exported' : 'LaTeX source exported', path)
  } catch (error) {
    store.setError(String(error))
  }
}
