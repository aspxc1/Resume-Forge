import { invoke, isTauri } from '@tauri-apps/api/core'
import { useStore } from './store'

export async function openLink(url: string) {
  try {
    if (isTauri()) await invoke('open_link', { url })
    else window.open(url, '_blank', 'noopener,noreferrer')
  } catch (error) { useStore.getState().setError(String(error)) }
}
