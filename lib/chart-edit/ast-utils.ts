/** Find a property by key name in an ObjectExpression AST node */
export function findProperty(objExpr: any, keyName: string): any | null {
  if (!objExpr || objExpr.type !== 'ObjectExpression') return null
  for (const prop of objExpr.properties) {
    if (prop.type !== 'Property') continue
    const key = prop.key
    if (
      (key.type === 'Identifier' && key.name === keyName) ||
      (key.type === 'Literal' && key.value === keyName)
    ) {
      return prop
    }
  }
  return null
}
