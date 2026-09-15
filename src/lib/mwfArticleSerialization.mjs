// JSON scalars are valid YAML and remain on one physical line. This keeps new
// MWF artifacts compatible with the byte-only metadata/closed-envelope readers,
// including long text, apostrophes, nested signed evidence and embedded newlines.
function normalizeDates(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(normalizeDates)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeDates(nested)]))
  return value
}
export function serializeMwfArticle(content, data) {
  if (typeof content !== 'string' || !data || typeof data !== 'object' || Array.isArray(data)) throw Error('invalid_article')
  const lines = Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw Error('invalid_frontmatter_key')
    return `${key}: ${JSON.stringify(normalizeDates(value))}`
  })
  return `---\n${lines.join('\n')}\n---\n${content.endsWith('\n') ? content : content + '\n'}`
}
