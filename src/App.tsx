import { createContext, useContext, useState, useEffect, Suspense, lazy, type ComponentType } from 'react'
import { Routes, Route, useParams, Link } from 'react-router-dom'
import { VizThemeProvider } from '@opendata-ai/openchart-react'
import { ReportLayout } from './components/ReportLayout'
import { ReportIndex } from './components/ReportIndex'

// --- Types ---

export interface ReportMeta {
  title: string
  date: string
  description: string
  tags: string[]
}

export interface ReportEntry {
  slug: string
  meta: ReportMeta
  load: () => Promise<{ default: ComponentType }>
}

// --- Dark Mode Context ---

const DarkModeContext = createContext<{ isDark: boolean; toggle: () => void }>({
  isDark: false,
  toggle: () => {},
})

export const useDarkMode = () => useContext(DarkModeContext)

// --- MDX Auto-Discovery ---

// Eager glob for metadata (available at build time for the index page)
const metaModules = import.meta.glob<ReportMeta>('./reports/[!_]*.mdx', {
  eager: true,
  import: 'meta',
})

// Lazy glob for components (loaded on demand)
const componentModules = import.meta.glob<{ default: ComponentType }>('./reports/[!_]*.mdx')

function buildReportEntries(): ReportEntry[] {
  return Object.keys(metaModules)
    .filter((path) => metaModules[path])
    .map((path) => {
      const slug = path.replace('./reports/', '').replace('.mdx', '')
      return {
        slug,
        meta: metaModules[path],
        load: componentModules[path],
      }
    })
}

const reports = buildReportEntries()

// Pre-build lazy components
const lazyReports: Record<string, ReturnType<typeof lazy>> = Object.fromEntries(
  reports.map((r) => [r.slug, lazy(() => r.load())])
)

// --- Report Page ---

function ReportPage() {
  const { slug } = useParams<{ slug: string }>()
  const report = slug ? reports.find((r) => r.slug === slug) : undefined

  if (!report || !slug) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-foreground">Report not found</h1>
        <p className="mt-2 text-muted-foreground">
          No report matching that URL.{' '}
          <Link to="/" className="text-primary hover:text-foreground transition-colors">
            Back to reports
          </Link>
        </p>
      </div>
    )
  }

  const Component = lazyReports[slug]

  return (
    <ReportLayout meta={report.meta}>
      <Suspense
        fallback={
          <div className="py-12 text-muted-foreground">Loading report...</div>
        }
      >
        <Component />
      </Suspense>
    </ReportLayout>
  )
}

// --- App ---

export function App() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('theme')
    if (stored === 'dark') return true
    if (stored === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggle = () => setIsDark((prev) => !prev)

  return (
    <DarkModeContext.Provider value={{ isDark, toggle }}>
      <VizThemeProvider theme={undefined} darkMode={isDark ? 'force' : 'off'}>
        <div className="min-h-screen bg-background text-foreground transition-colors">
          <Routes>
            <Route path="/" element={<ReportIndex reports={reports} />} />
            <Route path="/:slug" element={<ReportPage />} />
          </Routes>
        </div>
      </VizThemeProvider>
    </DarkModeContext.Provider>
  )
}
