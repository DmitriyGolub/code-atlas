export interface Markup {
  readonly markup: string
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export const escapeText = (text: string): string => text.replace(/[&<>"]/g, (character) => ENTITIES[character])

const isMarkup = (value: unknown): value is Markup => typeof value === 'object' && value !== null && 'markup' in value

function render(value: unknown): string {
  if (isMarkup(value)) return value.markup
  if (Array.isArray(value)) return value.map(render).join('')
  if (value === null || value === undefined || value === false) return ''
  return escapeText(String(value))
}

export const raw = (markup: string): Markup => ({ markup })

export const html = (strings: TemplateStringsArray, ...values: unknown[]): Markup =>
  raw(strings.reduce((output, part, index) => output + render(values[index - 1]) + part))

export const isEmpty = (value: Markup): boolean => value.markup === ''
