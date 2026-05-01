// Edit event types matching OpenChart's ElementEdit discriminated union.
// We define our own subset here to avoid importing the full openchart-core
// package in server-side code.

export interface Offset {
  dx?: number
  dy?: number
}

export type ChartElementRef =
  | { type: 'annotation'; index: number; id?: string; text?: string }
  | { type: 'chrome'; key: 'title' | 'subtitle' | 'source' | 'byline' | 'footer' }
  | { type: 'series-label'; series: string }
  | { type: 'legend' }

export type ChartEdit =
  | { type: 'annotation'; annotation: { text: string }; offset: Offset }
  | { type: 'annotation-connector'; annotation: { text: string }; endpoint: 'from' | 'to'; offset: Offset }
  | { type: 'range-label'; annotation: { label: string }; labelOffset: Offset }
  | { type: 'refline-label'; annotation: { label: string }; labelOffset: Offset }
  | { type: 'chrome'; key: 'title' | 'subtitle' | 'source' | 'byline' | 'footer'; text: string; offset: Offset }
  | { type: 'series-label'; series: string; offset: Offset }
  | { type: 'legend'; offset: Offset }
  | { type: 'delete'; element: ChartElementRef }

export interface ChartEditRequest {
  slug: string
  chartTitle?: string
  chartIndex?: number
  edit: ChartEdit
}

export interface ChartBlock {
  specStart: number  // byte offset of spec object literal start (the { after spec={{)
  specEnd: number    // byte offset of spec object literal end (the } before }})
  specSource: string // the raw source of the spec object literal
}
