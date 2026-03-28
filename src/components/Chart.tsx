import { Chart as OpenChart, type ChartProps } from '@opendata-ai/openchart-react'
import type { ElementEdit, TextAnnotation, RangeAnnotation, RefLineAnnotation } from '@opendata-ai/openchart-core'
import { useState, useEffect, useRef, useCallback } from 'react'

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

function persistEdit(slug: string, chartTitle: string | undefined, chartIndex: number, edit: ElementEdit) {
  // Build a debounce key so rapid drags of the same element coalesce
  const editKey = edit.type === 'annotation' ? `anno:${edit.annotation.text}` :
                  edit.type === 'annotation-connector' ? `conn:${edit.annotation.text}:${edit.endpoint}` :
                  edit.type === 'range-label' ? `range:${edit.annotation.label}` :
                  edit.type === 'refline-label' ? `refline:${edit.annotation.label}` :
                  edit.type === 'chrome' ? `chrome:${edit.key}` :
                  edit.type === 'series-label' ? `series:${edit.series}` :
                  'legend'
  const debounceId = `${slug}:${chartIndex}:${editKey}`

  const existing = debounceTimers.get(debounceId)
  if (existing) clearTimeout(existing)

  debounceTimers.set(debounceId, setTimeout(() => {
    debounceTimers.delete(debounceId)
    fetch('/__chart-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, chartTitle, chartIndex, edit }),
    }).catch(err => {
      console.warn('[chart-edit] Failed to persist edit:', err)
    })
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
export function Chart(props: ChartProps) {
  const { spec, onEdit: externalOnEdit, ...rest } = props
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
    }

    // Persist to source file in dev mode
    if (import.meta.env.DEV) {
      const slug = getSlug()
      if (slug) {
        persistEdit(slug, getChartTitle(spec), chartIndex, edit)
      }
    }

    externalOnEdit?.(edit)
  }, [spec, externalOnEdit])

  // Merge overrides into the spec
  const mergedSpec = {
    ...spec,
    ...(overrides.annotations && { annotations: overrides.annotations }),
    ...(overrides.chrome && { chrome: overrides.chrome }),
    ...(overrides.legend && { legend: overrides.legend }),
    ...(overrides.labels && { labels: overrides.labels }),
  }

  return <OpenChart spec={mergedSpec} onEdit={handleEdit} {...rest} />
}
