import * as acorn from 'acorn'
import type { ChartEdit, Offset } from './types'
import { findProperty } from './ast-utils'

/**
 * Patch a spec object literal source string based on a chart edit event.
 * Returns the patched source string, or null if patching fails.
 *
 * Strategy: parse the spec with acorn, find the target AST node,
 * string-splice only the changed value. Everything else stays byte-identical.
 */
export function patchSpec(specSource: string, edit: ChartEdit): string | null {
  let ast: any

  try {
    // parseExpressionAt treats `{` as an ObjectExpression in expression context
    ast = acorn.parseExpressionAt(specSource, 0, {
      ecmaVersion: 2022,
      sourceType: 'module',
    })
  } catch {
    return null
  }

  const ctx: PatchContext = { specSource, splices: [] }

  switch (edit.type) {
    case 'annotation':
      patchAnnotationOffset(ctx, ast, edit.annotation.text, 'offset', edit.offset)
      break
    case 'annotation-connector':
      patchAnnotationConnectorOffset(ctx, ast, edit.annotation.text, edit.endpoint, edit.offset)
      break
    case 'range-label':
      patchAnnotationLabelOffset(ctx, ast, 'range', edit.annotation.label, edit.labelOffset)
      break
    case 'refline-label':
      patchAnnotationLabelOffset(ctx, ast, 'refline', edit.annotation.label, edit.labelOffset)
      break
    case 'chrome':
      patchChrome(ctx, ast, edit.key, edit.text, edit.offset)
      break
    case 'series-label':
      patchSeriesLabel(ctx, ast, edit.series, edit.offset)
      break
    case 'legend':
      patchLegend(ctx, ast, edit.offset)
      break
    default:
      return null
  }

  if (ctx.splices.length === 0) return null

  return applySplices(specSource, ctx.splices)
}

// ─── Types ───────────────────────────────────────────────────────

interface Splice {
  start: number
  end: number
  replacement: string
}

interface PatchContext {
  specSource: string
  splices: Splice[]
}

// ─── Splice application ─────────────────────────────────────────

function applySplices(source: string, splices: Splice[]): string {
  const sorted = [...splices].sort((a, b) => b.start - a.start)
  let result = source
  for (const { start, end, replacement } of sorted) {
    result = result.slice(0, start) + replacement + result.slice(end)
  }
  return result
}

// ─── AST helpers ─────────────────────────────────────────────────

function findAnnotationsArray(ast: any): any | null {
  const prop = findProperty(ast, 'annotations')
  if (!prop || prop.value.type !== 'ArrayExpression') return null
  return prop.value
}

function findAnnotationByField(arr: any, field: string, value: string): any | null {
  for (const elem of arr.elements) {
    if (elem.type !== 'ObjectExpression') continue
    const prop = findProperty(elem, field)
    if (prop?.value.type === 'Literal' && prop.value.value === value) {
      return elem
    }
  }
  return null
}

function isValidIdentifier(s: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)
}

// ─── Indentation detection ───────────────────────────────────────

/** Detect the indentation of a line containing a given position in the source */
function detectIndent(src: string, pos: number): string {
  let lineStart = pos
  while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--
  const line = src.slice(lineStart, pos)
  const match = line.match(/^(\s*)/)
  return match ? match[1] : '      '
}

/** Get the indentation used by the first property of an object node */
function objectPropertyIndent(ctx: PatchContext, objNode: any): string {
  if (objNode.properties.length > 0) {
    return detectIndent(ctx.specSource, objNode.properties[0].key.start)
  }
  const objIndent = detectIndent(ctx.specSource, objNode.start)
  return objIndent + '  '
}

// ─── Trailing comma detection ────────────────────────────────────

function hasTrailingComma(ctx: PatchContext, lastPropEnd: number, objEnd: number): boolean {
  const between = ctx.specSource.slice(lastPropEnd, objEnd)
  return /^\s*,/.test(between)
}

// ─── Serialization ───────────────────────────────────────────────

function serializeOffset(offset: Offset): string {
  const parts: string[] = []
  if (offset.dx != null) parts.push(`dx: ${Math.round(offset.dx)}`)
  if (offset.dy != null) parts.push(`dy: ${Math.round(offset.dy)}`)
  return `{ ${parts.join(', ')} }`
}

// ─── Upsert: update existing property or insert new one ──────────

function upsertProperty(ctx: PatchContext, objNode: any, key: string, valueSource: string): void {
  const existing = findProperty(objNode, key)
  if (existing) {
    ctx.splices.push({
      start: existing.value.start,
      end: existing.value.end,
      replacement: valueSource,
    })
  } else {
    insertProperty(ctx, objNode, key, valueSource)
  }
}

function insertProperty(ctx: PatchContext, objNode: any, key: string, valueSource: string): void {
  const props = objNode.properties
  const objEnd = objNode.end

  if (props.length === 0) {
    // Empty object: insert between the braces
    // Find the position just after `{` and just before `}`
    const indent = detectIndent(ctx.specSource, objNode.start) + '  '
    const keyStr = isValidIdentifier(key) ? key : JSON.stringify(key)
    const insertion = '\n' + indent + keyStr + ': ' + valueSource + '\n' + detectIndent(ctx.specSource, objNode.start)
    ctx.splices.push({ start: objNode.start + 1, end: objEnd - 1, replacement: insertion })
    return
  }

  const lastProp = props[props.length - 1]
  const lastEnd = lastProp.end

  const needsComma = !hasTrailingComma(ctx, lastEnd, objEnd)
  const indent = objectPropertyIndent(ctx, objNode)
  const keyStr = isValidIdentifier(key) ? key : JSON.stringify(key)
  const insertion = (needsComma ? ',' : '') + '\n' + indent + keyStr + ': ' + valueSource

  ctx.splices.push({ start: lastEnd, end: lastEnd, replacement: insertion })
}

// ─── Patch operations ────────────────────────────────────────────

function patchAnnotationOffset(
  ctx: PatchContext, ast: any, text: string, offsetKey: string, offset: Offset
): void {
  const arr = findAnnotationsArray(ast)
  if (!arr) return
  const anno = findAnnotationByField(arr, 'text', text)
  if (!anno) return
  upsertProperty(ctx, anno, offsetKey, serializeOffset(offset))
}

function patchAnnotationConnectorOffset(
  ctx: PatchContext, ast: any, text: string, endpoint: 'from' | 'to', offset: Offset
): void {
  const arr = findAnnotationsArray(ast)
  if (!arr) return
  const anno = findAnnotationByField(arr, 'text', text)
  if (!anno) return

  const connProp = findProperty(anno, 'connectorOffset')
  if (connProp && connProp.value.type === 'ObjectExpression') {
    upsertProperty(ctx, connProp.value, endpoint, serializeOffset(offset))
  } else {
    const value = `{ ${endpoint}: ${serializeOffset(offset)} }`
    upsertProperty(ctx, anno, 'connectorOffset', value)
  }
}

function patchAnnotationLabelOffset(
  ctx: PatchContext, ast: any, annoType: string, label: string, offset: Offset
): void {
  const arr = findAnnotationsArray(ast)
  if (!arr) return
  const anno = findAnnotationByField(arr, 'label', label)
  if (!anno) return

  const typeProp = findProperty(anno, 'type')
  if (typeProp?.value.type === 'Literal' && typeProp.value.value !== annoType) return

  upsertProperty(ctx, anno, 'labelOffset', serializeOffset(offset))
}

function patchChrome(
  ctx: PatchContext, ast: any, key: string, text: string, offset: Offset
): void {
  const chromeProp = findProperty(ast, 'chrome')
  if (!chromeProp || chromeProp.value.type !== 'ObjectExpression') return

  const keyProp = findProperty(chromeProp.value, key)
  if (!keyProp) return

  if (keyProp.value.type === 'Literal' && typeof keyProp.value.value === 'string') {
    const escaped = JSON.stringify(text)
    const replacement = `{ text: ${escaped}, offset: ${serializeOffset(offset)} }`
    ctx.splices.push({
      start: keyProp.value.start,
      end: keyProp.value.end,
      replacement,
    })
  } else if (keyProp.value.type === 'ObjectExpression') {
    upsertProperty(ctx, keyProp.value, 'offset', serializeOffset(offset))
  }
}

function patchSeriesLabel(
  ctx: PatchContext, ast: any, series: string, offset: Offset
): void {
  const labelsProp = findProperty(ast, 'labels')

  if (!labelsProp) {
    const seriesKey = isValidIdentifier(series) ? series : JSON.stringify(series)
    const value = `{ offsets: { ${seriesKey}: ${serializeOffset(offset)} } }`
    insertProperty(ctx, ast, 'labels', value)
    return
  }

  if (labelsProp.value.type !== 'ObjectExpression') return

  const offsetsProp = findProperty(labelsProp.value, 'offsets')
  if (!offsetsProp) {
    const seriesKey = isValidIdentifier(series) ? series : JSON.stringify(series)
    const value = `{ ${seriesKey}: ${serializeOffset(offset)} }`
    insertProperty(ctx, labelsProp.value, 'offsets', value)
    return
  }

  if (offsetsProp.value.type !== 'ObjectExpression') return
  upsertProperty(ctx, offsetsProp.value, series, serializeOffset(offset))
}

function patchLegend(
  ctx: PatchContext, ast: any, offset: Offset
): void {
  const legendProp = findProperty(ast, 'legend')

  if (!legendProp) {
    insertProperty(ctx, ast, 'legend', `{ offset: ${serializeOffset(offset)} }`)
    return
  }

  if (legendProp.value.type !== 'ObjectExpression') return
  upsertProperty(ctx, legendProp.value, 'offset', serializeOffset(offset))
}
