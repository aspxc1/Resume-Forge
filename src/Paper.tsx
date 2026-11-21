import { Fragment, type CSSProperties, type ReactNode, type Ref } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { type ResumeDocument } from './model'
import { safeUrl } from './resume'
import './fonts.css'
import './paper.css'

export const dimensions = {
  letter: { width: 8.5 * 96, height: 11 * 96, w: '8.5in', h: '11in' },
  a4: { width: 210 / 25.4 * 96, height: 297 / 25.4 * 96, w: '210mm', h: '297mm' },
}

export function InlineBold({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^\n]+?\*\*)/g).map((part, i) =>
    i % 2 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  )}</>
}

function Link({ href, children, interactive }: { href?: string; children: ReactNode; interactive: boolean }) {
  if (!href) return <>{children}</>
  return <a href={href} target="_blank" rel="noreferrer" onClick={interactive && isTauri() ? (event) => {
    event.preventDefault()
    void import('./native').then(({ openLink }) => openLink(href))
  } : undefined}>{children}</a>
}

export function Paper({ resume, contentRef, overflow = false, interactive = true }: {
  resume: ResumeDocument; contentRef?: Ref<HTMLDivElement>; overflow?: boolean; interactive?: boolean
}) {
  const { profile, layout } = resume
  const { w, h } = dimensions[resume.page_size]
  const styles = {
    '--paper-width': w, '--paper-height': h,
    '--margin-x': `${layout.margin_x_in}in`, '--margin-y': `${layout.margin_y_in}in`,
    '--base-size': `${layout.font_size_pt}pt`, '--resume-line': layout.line_height,
    '--section-gap': `${layout.section_gap_pt}pt`, '--item-gap': `${layout.item_gap_pt}pt`, '--bullet-gap': `${layout.bullet_gap_pt}pt`,
  } as CSSProperties
  const contacts = [
    { text: profile.phone },
    { text: profile.email, href: safeUrl(`mailto:${profile.email}`, ['mailto:']) },
    { text: profile.linkedin_display || profile.linkedin_url, href: safeUrl(profile.linkedin_url) },
    { text: profile.github_display || profile.github_url, href: safeUrl(profile.github_url) },
    { text: profile.portfolio_display || profile.portfolio_url, href: safeUrl(profile.portfolio_url) },
    { text: profile.location },
  ].filter((contact) => contact.text)
  return <article className="resume-paper" style={styles} aria-label="Resume document">
    <div className="resume-content" ref={contentRef}>
      {(profile.full_name || contacts.length > 0) && <header className="resume-header">
        {profile.full_name && <h1 className="resume-name">{profile.full_name}</h1>}
        {contacts.length > 0 && <p className="resume-contact">{contacts.map(({ text, href }, index) =>
          <Fragment key={index}>{index > 0 && ' | '}<Link href={href} interactive={interactive}>{text}</Link></Fragment>
        )}</p>}
      </header>}
      {resume.sections.map((section) => <section key={section.key} className="resume-section">
        <h2 className="resume-section-title">{section.title}</h2>
        {section.items.map((item) => {
          const oneRow = section.key === 'projects' || section.key === 'publications'
          const education = section.key === 'education'
          const title = <strong><Link href={safeUrl(item.url)} interactive={interactive}>{item.title}</Link></strong>
          return <div className="resume-entry" key={item.id}>
            <div className="resume-row"><span>{title}{oneRow && item.subtitle && <> | <em>{item.subtitle}</em></>}</span><span>{education ? item.location : item.date_range}</span></div>
            {!oneRow && (item.subtitle || (education ? item.date_range : item.location)) && <div className="resume-row resume-secondary">
              <span>{item.subtitle}</span><span>{education ? item.date_range : item.location}</span>
            </div>}
            {item.extra_line && <p className="resume-extra"><InlineBold text={item.extra_line}/></p>}
            {item.bullets.length > 0 && <ul className="resume-bullets">{item.bullets.map((bullet) => <li key={bullet.id}><InlineBold text={bullet.content}/></li>)}</ul>}
          </div>
        })}
        {section.skills.map((category) => <p key={category.id} className="resume-skill"><strong>{category.name}:</strong> {category.skills.map((skill) => skill.name).join(', ')}</p>)}
      </section>)}
    </div>
    {overflow && <div className="resume-cutoff" aria-label="One-page cutoff"/>}
  </article>
}
