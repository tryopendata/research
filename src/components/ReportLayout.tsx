import { useState, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DarkModeToggle } from './DarkModeToggle'

interface ReportLayoutProps {
  meta: {
    title: string
    date: string
    description: string
    tags: string[]
  }
  children: ReactNode
}

export function ReportLayout({ meta, children }: ReportLayoutProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const updateProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      const scrolled = window.scrollY
      setProgress(scrollHeight > 0 ? scrolled / scrollHeight : 0)
    }
    window.addEventListener('scroll', updateProgress, { passive: true })
    return () => window.removeEventListener('scroll', updateProgress)
  }, [])

  const formattedDate = new Date(meta.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const sectionLabel = meta.tags.length > 0 ? meta.tags[0] : 'Report'

  return (
    <>
      {/* Reading progress bar - hairline */}
      <div className="fixed top-0 left-0 right-0 z-50 h-px bg-transparent">
        <div
          className="h-full w-full origin-left bg-foreground/20"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[780px] items-center justify-between px-6 py-4">
          <Link to="/" className="font-serif text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors">
            OpenData Reports
          </Link>
          <DarkModeToggle />
        </div>
      </header>

      {/* Article */}
      <article className="mx-auto max-w-[780px] px-6">
        {/* Title block */}
        <header className="pt-16 pb-10 border-b border-border mb-10">
          <div className="uppercase tracking-[0.15em] text-xs font-sans font-medium text-muted-foreground mb-4">
            {sectionLabel}
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-[-0.02em] text-foreground leading-[1.08] md:text-5xl">
            {meta.title}
          </h1>
          <p className="mt-4 font-serif text-xl text-muted-foreground leading-snug md:text-2xl">
            {meta.description}
          </p>
          <time dateTime={meta.date} className="mt-4 block font-sans text-sm text-muted-foreground uppercase tracking-wide">
            {formattedDate}
          </time>
        </header>

        {/* Content */}
        <div className="prose article-content">
          {children}
        </div>

        {/* Footer */}
        <footer className="mt-10 mb-8 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground/70">
            Data sourced from the <a href="https://tryopendata.ai" className="text-muted-foreground/70 hover:text-foreground transition-colors">OpenData platform</a>.
            {' '}Visualizations powered by <a href="https://github.com/tryopendata/openchart" className="text-muted-foreground/70 hover:text-foreground transition-colors">OpenChart</a>.
          </p>
        </footer>
      </article>
    </>
  )
}
