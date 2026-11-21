import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { openLink } from './native'
import { safeUrl } from './resume'

export default function NotesPreview({ text }: { text: string }) {
  return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']} components={{
    a: ({ href, children }) => {
      const url = href && safeUrl(href, ['https:', 'http:', 'mailto:'])
      return url ? <a href={url} onClick={(event) => { event.preventDefault(); void openLink(url) }}>{children}</a> : <span>{children}</span>
    },
  }}>{text || 'No interview notes yet.'}</Markdown></div>
}
