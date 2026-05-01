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
      patchAnnotationOffset(ctx, ast, edit.annotation.text, edit.offset)
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
    case 'delete':
      if (edit.element.type === 'annotation' && edit.element.index != null) {
        patchAnnotationDelete(ctx, ast, edit.element.index, edit.element.text)
      }
      break
    default:
      return null
  }

  if (ctx.splices.length === 0) return null

  const patched = applySplices(specSource, ctx.splices)

  // Re-parse to ensure patched source is valid JS
  try {
    acorn.parseExpressionAt(patched, 0, {
      ecmaVersion: 2022,
      sourceType: 'module',
    })
  } catch {
    console.warn('[patchSpec] Patched output failed validation, discarding edit')
    return null
  }

  return patched
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

function detectIndent(src: string, pos: number): string {
  let lineStart = pos
  while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--
  const line = src.slice(lineStart, pos)
  const match = line.match(/^(\s*)/)
  return match ? match[1] : '      '
}

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

// ─── Single-line detection ───────────────────────────────────────

function isSingleLineNode(ctx: PatchContext, node: any): boolean {
  return !ctx.specSource.slice(node.start, node.end).includes('\n')
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
    const indent = detectIndent(ctx.specSource, objNode.start) + '  '
    const keyStr = isValidIdentifier(key) ? key : JSON.stringify(key)
    const insertion = '\n' + indent + keyStr + ': ' + valueSource + '\n' + detectIndent(ctx.specSource, objNode.start)
    ctx.splices.push({ start: objNode.start + 1, end: objEnd - 1, replacement: insertion })
    return
  }

  const lastProp = props[props.length - 1]
  const lastEnd = lastProp.end
  const needsComma = !hasTrailingComma(ctx, lastEnd, objEnd)
  const keyStr = isValidIdentifier(key) ? key : JSON.stringify(key)

  if (isSingleLineNode(ctx, objNode)) {
    const insertion = (needsComma ? ', ' : ' ') + keyStr + ': ' + valueSource
    ctx.splices.push({ start: lastEnd, end: lastEnd, replacement: insertion })
  } else {
    const indent = objectPropertyIndent(ctx, objNode)
    const insertion = (needsComma ? ',' : '') + '\n' + indent + keyStr + ': ' + valueSource
    ctx.splices.push({ start: lastEnd, end: lastEnd, replacement: insertion })
  }
}

// ─── Remove property from object ─────────────────────────────────

function removeProperty(ctx: PatchContext, objNode: any, key: string): void {
  const props = objNode.properties
  const idx = props.findIndex((p: any) => {
    if (p.type !== 'Property') return false
    const k = p.key
    return (k.type === 'Identifier' && k.name === key) ||
           (k.type === 'Literal' && k.value === key)
  })
  if (idx === -1) return

  const prop = props[idx]
  const isOnly = props.length === 1
  const isLast = idx === props.length - 1

  if (isOnly) {
    ctx.splices.push({ start: objNode.start + 1, end: objNode.end - 1, replacement: '' })
    return
  }

  if (isLast) {
    // Remove from after previous property end (consuming preceding comma) through this property end
    const prevProp = props[idx - 1]
    const between = ctx.specSource.slice(prevProp.end, prop.key.start)
    const commaIdx = between.indexOf(',')
    const removeStart = commaIdx !== -1 ? prevProp.end + commaIdx : prevProp.end
    ctx.splices.push({ start: removeStart, end: prop.end, replacement: '' })
  } else {
    // Remove this property through the separator before the next property
    const nextProp = props[idx + 1]
    const afterProp = ctx.specSource.slice(prop.end, nextProp.key.start)
    const commaMatch = afterProp.match(/^\s*,\s*/)
    const removeEnd = commaMatch ? prop.end + commaMatch[0].length : nextProp.key.start
    // Also consume leading whitespace on this line
    let removeStart = prop.key.start
    const before = ctx.specSource.slice(0, prop.key.start)
    const lastNl = before.lastIndexOf('\n')
    if (lastNl !== -1) {
      const linePrefix = before.slice(lastNl + 1)
      if (/^\s*$/.test(linePrefix)) {
        removeStart = lastNl + 1
      }
    }
    ctx.splices.push({ start: removeStart, end: removeEnd, replacement: '' })
  }
}

// ─── Remove element from array ───────────────────────────────────

function removeArrayElement(ctx: PatchContext, arrNode: any, index: number): void {
  const elements = arrNode.elements
  if (index < 0 || index >= elements.length) return

  const element = elements[index]
  const isOnly = elements.length === 1
  const isLast = index === elements.length - 1

  if (isOnly) {
    ctx.splices.push({ start: arrNode.start + 1, end: arrNode.end - 1, replacement: '' })
    return
  }

  if (isLast) {
    const prevElement = elements[index - 1]
    const between = ctx.specSource.slice(prevElement.end, element.start)
    const commaIdx = between.indexOf(',')
    const removeStart = commaIdx !== -1 ? prevElement.end + commaIdx : prevElement.end
    ctx.splices.push({ start: removeStart, end: element.end, replacement: '' })
  } else {
    const nextElement = elements[index + 1]
    const afterElement = ctx.specSource.slice(element.end, nextElement.start)
    const commaMatch = afterElement.match(/^\s*,\s*/)
    const removeEnd = commaMatch ? element.end + commaMatch[0].length : nextElement.start
    let removeStart = element.start
    const before = ctx.specSource.slice(0, element.start)
    const lastNl = before.lastIndexOf('\n')
    if (lastNl !== -1) {
      const linePrefix = before.slice(lastNl + 1)
      if (/^\s*$/.test(linePrefix)) {
        removeStart = lastNl + 1
      }
    }
    ctx.splices.push({ start: removeStart, end: removeEnd, replacement: '' })
  }
}

// ─── Patch operations ────────────────────────────────────────────

function patchAnnotationOffset(
  ctx: PatchContext, ast: any, text: string, offset: Offset
): void {
  const arr = findAnnotationsArray(ast)
  if (!arr) return
  const anno = findAnnotationByField(arr, 'text', text)
  if (!anno) return

  // Offset values from openchart are absolute (accumulated base + drag delta).
  // Write directly without adding to existing values.
  const newDx = Math.round(offset.dx ?? 0)
  const newDy = Math.round(offset.dy ?? 0)

  const existingOffset = findProperty(anno, 'offset')

  if (existingOffset && existingOffset.value.type === 'ObjectExpression') {
    upsertProperty(ctx, existingOffset.value, 'dx', String(newDx))
    upsertProperty(ctx, existingOffset.value, 'dy', String(newDy))
  } else {
    upsertProperty(ctx, anno, 'offset', serializeOffset({ dx: newDx, dy: newDy }))
  }

  // Clean up stale top-level dx/dy left by previous buggy edits
  if (findProperty(anno, 'dx')) removeProperty(ctx, anno, 'dx')
  if (findProperty(anno, 'dy')) removeProperty(ctx, anno, 'dy')
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

function patchAnnotationDelete(
  ctx: PatchContext, ast: any, index: number, expectedText?: string
): void {
  const arr = findAnnotationsArray(ast)
  if (!arr) return

  const elements = arr.elements
  if (index < 0 || index >= elements.length) return

  // Verify the annotation at this index matches expected text (if provided)
  if (expectedText) {
    const element = elements[index]
    if (element.type === 'ObjectExpression') {
      const textProp = findProperty(element, 'text')
      if (textProp?.value.type === 'Literal' && textProp.value.value !== expectedText) {
        console.warn(`[patchSpec] Annotation at index ${index} has text "${textProp.value.value}", expected "${expectedText}". Skipping delete.`)
        return
      }
    }
  }

  removeArrayElement(ctx, arr, index)
}
