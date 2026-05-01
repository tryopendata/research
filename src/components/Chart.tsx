import { Chart as OpenChart, type ChartProps } from '@opendata-ai/openchart-react'
import type { ElementEdit, TextAnnotation, RangeAnnotation, RefLineAnnotation } from '@opendata-ai/openchart-core'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useContainerWidth } from '../hooks/use-container-width'

/** Mobile breakpoint (px). Charts narrower than this apply `mobileSpec` overrides. */
const MOBILE_BREAKPOINT = 500

/**
 * Deep-merge `override` onto `base`. Arrays and primitives replace; plain
 * objects merge recursively. Used to apply narrow-viewport overrides to a
 * chart spec.
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base
  if (Array.isArray(override) || typeof override !== 'object') return override as T
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return override as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = deepMerge(out[key], value)
  }
  return out as T
}

// Module-level chart counter for ordinal index tracking.
// Resets each time the URL changes (route navigation).
let chartCounter = 0
let lastPathname = ''

function getChartIndex(): number {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  if (pathname !== lastPathname) {
    lastPathname = pathname
    chartCounter = 0
  }
  return chartCounter++
}

// Debounce timers keyed by chart+edit identifier
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function sendEdit(slug: string, chartTitle: string | undefined, chartIndex: number, edit: ElementEdit | Record<string, unknown>) {
  fetch('/__chart-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, chartTitle, chartIndex, edit }),
  }).catch(err => {
    console.warn('[chart-edit] Failed to persist edit:', err)
  })
}

function persistEdit(slug: string, chartTitle: string | undefined, chartIndex: number, edit: ElementEdit | Record<string, unknown>) {
  // Deletes are discrete actions -- send immediately, no debounce
  if ((edit as any).type === 'delete') {
    sendEdit(slug, chartTitle, chartIndex, edit)
    return
  }

  // Build a debounce key so rapid drags of the same element coalesce
  const e = edit as ElementEdit
  const editKey = e.type === 'annotation' ? `anno:${e.annotation.text}` :
                  e.type === 'annotation-connector' ? `conn:${e.annotation.text}:${e.endpoint}` :
                  e.type === 'range-label' ? `range:${e.annotation.label}` :
                  e.type === 'refline-label' ? `refline:${e.annotation.label}` :
                  e.type === 'chrome' ? `chrome:${e.key}` :
                  e.type === 'series-label' ? `series:${e.series}` :
                  'legend'
  const debounceId = `${slug}:${chartIndex}:${editKey}`

  const existing = debounceTimers.get(debounceId)
  if (existing) clearTimeout(existing)

  debounceTimers.set(debounceId, setTimeout(() => {
    debounceTimers.delete(debounceId)
    sendEdit(slug, chartTitle, chartIndex, edit)
  }, 300))
}

/** Extract the chrome.title text from a spec, handling both string and object forms */
function getChartTitle(spec: ChartProps['spec']): string | undefined {
  const title = spec.chrome?.title
  if (typeof title === 'string') return title
  if (title && typeof title === 'object' && 'text' in title) return (title as { text: string }).text
  return undefined
}

/** Derive the report slug from the current URL pathname */
function getSlug(): string {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  // Strip leading slash, e.g. "/income-vs-inflation" -> "income-vs-inflation"
  return pathname.replace(/^\//, '') || ''
}

/**
 * Wrapper around OpenChart's Chart that enables edit mode by default.
 * Dragged annotations, chrome, legend, and series labels persist their
 * positions by maintaining internal state that merges offsets back into
 * the spec on each edit event.
 *
 * In dev mode, edits are also sent to the Vite dev server to be written
 * back to the source .mdx file for permanent persistence.
 */
export function Chart(props: ChartProps & { mobileSpec?: Partial<ChartProps['spec']> }) {
  const { spec: baseSpec, mobileSpec, onEdit: externalOnEdit, ...rest } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useContainerWidth(containerRef)
  const isMobile = containerWidth !== null && containerWidth < MOBILE_BREAKPOINT

  // Apply mobile overrides when container is narrow. deepMerge preserves base
  // spec fields that aren't overridden. Memoized so identity is stable across
  // renders — without this, a new object every render triggers the reset
  // useEffect below into an infinite loop.
  const spec = useMemo(
    () => (isMobile && mobileSpec ? deepMerge(baseSpec, mobileSpec) : baseSpec),
    [baseSpec, mobileSpec, isMobile]
  )

  const specRef = useRef(spec)
  // Assign ordinal index exactly once per mount via useState initializer
  const [chartIndex] = useState(() => getChartIndex())

  // Track overrides produced by drag interactions
  const [overrides, setOverrides] = useState<{
    annotations?: typeof spec.annotations
    chrome?: typeof spec.chrome
    legend?: typeof spec.legend
    labels?: typeof spec.labels
  }>({})

  // Reset overrides when the spec identity changes (new chart via HMR)
  useEffect(() => {
    if (spec !== specRef.current) {
      specRef.current = spec
      setOverrides({})
    }
  }, [spec])

  const handleEdit = useCallback((edit: ElementEdit) => {
    switch (edit.type) {
      case 'annotation': {
        setOverrides(prev => {
          const annotations = [...(prev.annotations ?? spec.annotations ?? [])]
          const idx = annotations.findIndex(
            a => a.type === 'text' && (a as TextAnnotation).text === edit.annotation.text
          )
          if (idx >= 0) {
            annotations[idx] = { ...annotations[idx], offset: edit.offset }
          }
          return { ...prev, annotations }
        })
        break
      }
      case 'annotation-connector': {
        setOverrides(prev => {
          const annotations = [...(prev.annotations ?? spec.annotations ?? [])]
          const idx = annotations.findIndex(
            a => a.type === 'text' && (a as TextAnnotation).text === edit.annotation.text
          )
          if (idx >= 0) {
            const ta = annotations[idx] as TextAnnotation
            annotations[idx] = {
              ...ta,
              connectorOffset: {
                ...ta.connectorOffset,
                [edit.endpoint]: edit.offset,
              },
            }
          }
          return { ...prev, annotations }
        })
        break
      }
      case 'range-label': {
        setOverrides(prev => {
          const annotations = [...(prev.annotations ?? spec.annotations ?? [])]
          const idx = annotations.findIndex(
            a => a.type === 'range' && (a as RangeAnnotation).label === edit.annotation.label
          )
          if (idx >= 0) {
            annotations[idx] = { ...annotations[idx], labelOffset: edit.labelOffset }
          }
          return { ...prev, annotations }
        })
        break
      }
      case 'refline-label': {
        setOverrides(prev => {
          const annotations = [...(prev.annotations ?? spec.annotations ?? [])]
          const idx = annotations.findIndex(
            a => a.type === 'refline' && (a as RefLineAnnotation).label === edit.annotation.label
          )
          if (idx >= 0) {
            annotations[idx] = { ...annotations[idx], labelOffset: edit.labelOffset }
          }
          return { ...prev, annotations }
        })
        break
      }
      case 'chrome': {
        setOverrides(prev => ({
          ...prev,
          chrome: {
            ...(prev.chrome ?? spec.chrome),
            [edit.key]: { text: edit.text, offset: edit.offset },
          },
        }))
        break
      }
      case 'series-label': {
        setOverrides(prev => ({
          ...prev,
          labels: {
            ...(prev.labels ?? spec.labels),
            offsets: {
              ...(prev.labels ?? spec.labels)?.offsets,
              [edit.series]: edit.offset,
            },
          },
        }))
        break
      }
      case 'legend': {
        setOverrides(prev => ({
          ...prev,
          legend: {
            ...(prev.legend ?? spec.legend),
            offset: edit.offset,
          },
        }))
        break
      }
      case 'delete': {
        if (edit.element.type === 'annotation') {
          // Capture text BEFORE mutating state for server-side verification
          const currentAnnotations = overrides.annotations ?? spec.annotations ?? []
          const deletedAnno = currentAnnotations[edit.element.index]
          const deletedText = deletedAnno?.type === 'text'
            ? (deletedAnno as TextAnnotation).text
            : undefined

          setOverrides(prev => {
            const annotations = [...(prev.annotations ?? spec.annotations ?? [])]
            if (edit.element.type === 'annotation' && edit.element.index >= 0 && edit.element.index < annotations.length) {
              annotations.splice(edit.element.index, 1)
            }
            return { ...prev, annotations }
          })

          // Persist immediately with enriched text
          if (import.meta.env.DEV) {
            const slug = getSlug()
            if (slug) {
              const enrichedEdit = {
                type: 'delete' as const,
                element: { ...edit.element, ...(deletedText && { text: deletedText }) },
              }
              persistEdit(slug, getChartTitle(spec), chartIndex, enrichedEdit)
            }
          }
          externalOnEdit?.(edit)
          return
        }
        break
      }
      case 'legend-toggle':
      case 'text-edit':
        return
    }

    // Persist to source file in dev mode
    if (import.meta.env.DEV) {
      const slug = getSlug()
      if (slug) {
        persistEdit(slug, getChartTitle(spec), chartIndex, edit)
      }
    }

    externalOnEdit?.(edit)
  }, [spec, overrides, chartIndex, externalOnEdit])

  // Merge overrides into the spec
  const mergedSpec = {
    ...spec,
    ...(overrides.annotations && { annotations: overrides.annotations }),
    ...(overrides.chrome && { chrome: overrides.chrome }),
    ...(overrides.legend && { legend: overrides.legend }),
    ...(overrides.labels && { labels: overrides.labels }),
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <OpenChart spec={mergedSpec} onEdit={handleEdit} {...rest} />
    </div>
  )
}
