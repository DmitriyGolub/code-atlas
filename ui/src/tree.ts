import type { Unit } from './types'
import { html, type Markup } from './markup'
import { icon } from './icons'
import { scrollIntoContainer } from './scroll'

interface Folder {
  folders: Map<string, Folder>
  files: Map<string, Unit[]>
}

const SHOWN = new Set(['system', 'component', 'rule', 'entity', 'outside', 'query', 'method'])

const emptyFolder = (): Folder => ({ folders: new Map(), files: new Map() })

function buildTree(units: Unit[]): Folder {
  const root = emptyFolder()
  for (const unit of units) {
    if (!SHOWN.has(unit.kind)) continue
    const parts = unit.file.split('/')
    const file = parts.pop()!
    let folder = root
    for (const part of parts) folder = folder.folders.get(part) ?? folder.folders.set(part, emptyFolder()).get(part)!
    folder.files.set(file, [...(folder.files.get(file) ?? []), unit])
  }
  return root
}

const countOf = (folder: Folder): number =>
  [...folder.files.values()].reduce((sum, list) => sum + list.length, 0) + [...folder.folders.values()].reduce((sum, child) => sum + countOf(child), 0)

function renderFolder(folder: Folder, depth: number): Markup {
  const byName = <Value>(entries: Map<string, Value>) => [...entries].sort(([first], [second]) => first.localeCompare(second))
  const folders = byName(folder.folders).map(([name, child]) =>
    html`<details${depth < 1 ? html` open` : ''}><summary><span>${icon('folder')}${name}</span><small>${countOf(child)}</small></summary>${renderFolder(child, depth + 1)}</details>`)
  const files = byName(folder.files).map(([name, units]) =>
    html`<details><summary class="file"><span>${icon('file')}${name}</span><small>${units.length}</small></summary>${[...units].sort((first, second) => first.line - second.line).map((unit) =>
      html`<div class="tree-item kind-${unit.kind}${unit.owner ? ' member' : ''}" data-go="${unit.id}" data-tree-id="${unit.id}" title="${unit.name} · line ${unit.line}"><i></i>${unit.owner ? unit.name.split('.').pop() : unit.name}</div>`)}</details>`)
  return html`<div class="tree-level">${folders}${files}</div>`
}

export const renderTree = (units: Unit[]): Markup => renderFolder(buildTree(units), 0)

export function revealInTree(tree: HTMLElement, id: string): void {
  tree.querySelector('.tree-item.current')?.classList.remove('current')
  const item = tree.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)
  if (!item) return
  item.classList.add('current')
  for (let parent = item.parentElement; parent && parent !== tree; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true
  scrollIntoContainer(tree, item)
}
