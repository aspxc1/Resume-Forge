import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FileText, SlidersHorizontal } from 'lucide-react'
import { type Layout, type ResumeDocument, type VariantConfig } from './model'
import { Paper, dimensions } from './Paper'
import { classicLayout } from './resume'

const sliders: [keyof Layout, string, number, number, number, string][] = [
  ['margin_x_in', 'Horizontal margins', .35, .65, .01, 'in'],
  ['margin_y_in', 'Vertical margins', .35, .65, .01, 'in'],
  ['font_size_pt', 'Base font size', 9.5, 11, .1, 'pt'],
  ['line_height', 'Line height', 1.05, 1.35, .01, '×'],
  ['section_gap_pt', 'Section spacing', 3, 14, .5, 'pt'],
  ['item_gap_pt', 'Item spacing', 0, 10, .5, 'pt'],
  ['bullet_gap_pt', 'Bullet spacing', 0, 5, .5, 'pt'],
]

export function Preview({ resume, controls, children }: {
  resume: ResumeDocument; controls?: { config: VariantConfig; update: (config: VariantConfig) => void }; children?: ReactNode
}) {
  const [zoom, setZoom] = useState('fit')
  const [size, setSize] = useState({ width: 0, maxHeight: 0, content: 0 })
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = viewport.current
    const body = content.current
    if (!box || !body) return
    let unscaledHeight = body.offsetHeight
    const measure = () => setSize({ width: box.clientWidth, maxHeight: Math.max(216, window.innerHeight - 205), content: unscaledHeight })
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find(({ target }) => target === body)
      if (entry) unscaledHeight = entry.contentRect.height
      measure()
    })
    observer.observe(box)
    observer.observe(body)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  const page = dimensions[resume.page_size]
  const margin = resume.layout.margin_y_in * 96
  const available = page.height - 2 * margin
  const fill = size.content / available
  const overflow = size.content > available + .5
  const lines = Math.ceil((size.content - available) / (resume.layout.font_size_pt * (96 / 72) * resume.layout.line_height))
  const scale = zoom === 'fit' ? Math.min(1, Math.max(.12, Math.min((size.width - 38) / page.width, (size.maxHeight - 34) / page.height))) : Number(zoom)
  const height = Math.max(page.height, size.content + 2 * margin)
  return <section className="panel preview" aria-label="Resume preview">
    <div className="preview-toolbar">
      <div className="preview-label"><FileText size={16}/><strong>Live preview</strong></div>
      <div className="preview-tools">
        <span className={`chip ${overflow ? 'error' : fill >= .85 ? 'success' : 'warning'}`} title="One-page overflow radar" role="status">
          <span className="radar-dot"/>{overflow ? `Overflowing by ~${lines} ${lines === 1 ? 'line' : 'lines'}` : `${Math.round(fill * 100)}% of 1 page`}
        </span>
        <select className="zoom" aria-label="Preview zoom" value={zoom} onChange={(e) => setZoom(e.target.value)}><option value="fit">Fit</option><option value="1">100%</option><option value="1.25">125%</option></select>
        {controls && <LayoutControls {...controls}/>}
      </div>
    </div>
    <div className="preview-canvas" ref={viewport}>
      <div className="page-frame" style={{ width: page.width * scale, height: height * scale }}>
        <div className="scaled-paper" style={{ transform: `scale(${scale})` }}><Paper resume={resume} contentRef={content} overflow={overflow}/></div>
      </div>
    </div>
    <footer className="preview-footer"><span>{resume.page_size === 'letter' ? 'US Letter · 8.5 × 11 in' : 'A4 · 210 × 297 mm'}</span>{children ?? <span>Jake’s Resume</span>}</footer>
  </section>
}

function LayoutControls({ config, update }: { config: VariantConfig; update: (config: VariantConfig) => void }) {
  return <details className="layout-controls">
    <summary className="icon-button" aria-label="Layout settings" title="Layout settings"><SlidersHorizontal size={17}/></summary>
    <div className="layout-popover panel">
      <h3>Layout tuning</h3>
      <label>Paper size<select value={config.page_size} onChange={(e) => update({ ...config, page_size: e.target.value as VariantConfig['page_size'] })}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
      {sliders.map(([key, label, min, max, step, units]) => <label key={key}>
        <span>{label}<output>{config.layout[key]} {units}</output></span>
        <input type="range" min={min} max={max} step={step} value={config.layout[key]} onChange={(e) => update({ ...config, layout: { ...config.layout, [key]: Number(e.target.value) } })}/>
      </label>)}
      <button className="button" onClick={() => update({ ...config, layout: { ...classicLayout } })}>Reset to Classic Jake’s Defaults</button>
    </div>
  </details>
}
