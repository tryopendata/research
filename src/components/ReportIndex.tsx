import { Link } from 'react-router-dom'
import { DarkModeToggle } from './DarkModeToggle'
import type { ReportEntry } from '../App'

interface ReportIndexProps {
  reports: ReportEntry[]
}

export function ReportIndex({ reports }: ReportIndexProps) {
  const sorted = [...reports].sort(
    (a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime()
  )

  return (
    <>
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[780px] items-center justify-between px-6 py-4">
          <span className="font-serif text-sm font-semibold uppercase tracking-[0.15em] text-foreground">
            OpenData Reports
          </span>
          <DarkModeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[780px] px-6 py-16">
        <h1 className="font-serif text-4xl font-bold tracking-[-0.02em] text-foreground md:text-5xl">
          Reports
        </h1>
        <p className="mt-3 font-serif text-xl text-muted-foreground italic">
          Data-driven research and analysis powered by OpenData.
        </p>

        <div className="mt-12">
          {sorted.map(({ slug, meta }, index) => {
            const formattedDate = new Date(meta.date + 'T00:00:00').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })

            const sectionLabel = meta.tags.length > 0 ? meta.tags[0] : 'Report'

            return (
              <Link
                key={slug}
                to={`/${slug}`}
                className={`group block py-8 ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="uppercase tracking-[0.15em] text-xs font-sans font-medium text-muted-foreground mb-2">
                  {sectionLabel}
                </div>
                <h2 className="font-serif text-xl font-semibold text-foreground group-hover:text-primary transition-colors md:text-2xl">
                  {meta.title}
                </h2>
                <p className="mt-2 font-serif text-base text-muted-foreground leading-relaxed line-clamp-2">
                  {meta.description}
                </p>
                <time
                  dateTime={meta.date}
                  className="mt-3 block font-sans text-xs text-muted-foreground uppercase tracking-wide"
                >
                  {formattedDate}
                </time>
              </Link>
            )
          })}

          {sorted.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">
              <p className="font-serif text-lg">No reports yet.</p>
              <p className="mt-1 text-sm font-sans">
                Ask Claude to generate one, or create an MDX file in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">src/reports/</code> to get started.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
