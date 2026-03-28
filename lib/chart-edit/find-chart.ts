import * as acorn from 'acorn'
import type { ChartBlock } from './types'
import { findProperty } from './ast-utils'

/**
 * Find a specific <Chart spec={{...}} /> block in an MDX file's source.
 *
 * Identification strategy:
 * 1. If chartTitle is provided, search for a `spec={{` whose object contains
 *    that title string within a `chrome` property. This is the primary key.
 * 2. If chartTitle is missing or not found, fall back to ordinal index
 *    (the Nth `<Chart` occurrence).
 *
 * Returns the byte offsets and raw source of the spec object literal,
 * or null if the chart can't be found.
 */
export function findChartBlock(
  fileContent: string,
  chartTitle?: string,
  ordinalIndex?: number
): ChartBlock | null {
  // Find all <Chart spec={{ positions
  const specPositions = findAllSpecPositions(fileContent)
  if (specPositions.length === 0) return null

  let targetSpecStart: number | null = null

  // Strategy 1: match by chrome.title
  if (chartTitle) {
    for (const pos of specPositions) {
      // Extract the spec and check if it contains the title
      const block = extractSpecAt(fileContent, pos)
      if (block && specContainsTitle(block.specSource, chartTitle)) {
        targetSpecStart = pos
        break
      }
    }
  }

  // Strategy 2: fallback to ordinal index
  if (targetSpecStart === null && ordinalIndex != null && ordinalIndex < specPositions.length) {
    targetSpecStart = specPositions[ordinalIndex]
  }

  if (targetSpecStart === null) return null

  return extractSpecAt(fileContent, targetSpecStart)
}

/**
 * Find all positions in the file where `spec={{` appears after `<Chart`.
 * Returns the byte offset of the inner `{` (the start of the object literal).
 */
function findAllSpecPositions(content: string): number[] {
  const positions: number[] = []
  const pattern = /< *Chart\b[^>]*\bspec\s*=\s*\{\{/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    // Find the position of the inner { (the object literal start).
    // The match ends at `{{`, so the inner { is at matchEnd - 1.
    const matchEnd = match.index + match[0].length
    positions.push(matchEnd - 1)
  }

  return positions
}

/**
 * Given the position of the `{` that starts a spec object literal,
 * use acorn to parse from that position and determine the object's extent.
 *
 * acorn.parseExpressionAt treats `{` as an ObjectExpression in expression
 * context, so no paren wrapping is needed. It stops parsing at the end of
 * the expression, ignoring trailing content like `}} />`.
 */
function extractSpecAt(fileContent: string, innerBracePos: number): ChartBlock | null {
  try {
    const ast = acorn.parseExpressionAt(fileContent, innerBracePos, {
      ecmaVersion: 2022,
      sourceType: 'module',
    }) as acorn.Node

    const specStart = innerBracePos
    const specEnd = ast.end
    const specSource = fileContent.slice(specStart, specEnd)

    return { specStart, specEnd, specSource }
  } catch {
    return null
  }
}

/**
 * Check if a spec source string contains a chrome.title matching the given title.
 * Parses the spec to extract string literal values (handles escape sequences).
 */
function specContainsTitle(specSource: string, title: string): boolean {
  // Quick pre-check: if the raw source doesn't even contain the title text, skip parsing
  if (!specSource.includes(title.slice(0, 20))) return false

  // Parse the spec to find chrome.title's decoded string value
  try {
    const ast = acorn.parseExpressionAt(specSource, 0, {
      ecmaVersion: 2022,
      sourceType: 'module',
    }) as any

    const chromeProperty = findProperty(ast, 'chrome')
    if (!chromeProperty) return false

    const chromeObj = chromeProperty.value
    if (chromeObj.type !== 'ObjectExpression') return false

    const titleProp = findProperty(chromeObj, 'title')
    if (!titleProp) return false

    // Title can be a string literal or an object { text: "..." }
    if (titleProp.value.type === 'Literal' && typeof titleProp.value.value === 'string') {
      return titleProp.value.value === title
    }
    if (titleProp.value.type === 'ObjectExpression') {
      const textProp = findProperty(titleProp.value, 'text')
      if (textProp?.value.type === 'Literal' && typeof textProp.value.value === 'string') {
        return textProp.value.value === title
      }
    }
  } catch {
    // If parsing fails, fall back to simple string match
    return specSource.includes(title)
  }

  return false
}

