import type { Spec } from './types'

export interface ModuleInfo { path: string; file: string; digest: string; units: number; systems: number; tests: number }
export interface ModuleLink { from: string; to: string; calls: number }
interface SplitIndex extends Pick<Spec, 'codeAtlas' | 'sourceDigest' | 'frame' | 'fresh'> { modules: ModuleInfo[]; links: ModuleLink[] }
type ModulePart = Pick<Spec, 'systems' | 'units' | 'edges' | 'findings' | 'tests' | 'impacts'>

const byText = (first: string, second: string) => (first > second ? 1 : first < second ? -1 : 0)
const framePosition = (position: number) => position || Number.POSITIVE_INFINITY

async function fetchJson<Value>(name: string): Promise<Value> {
  const response = await fetch(name, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${name}: ${response.status}`)
  return response.json() as Promise<Value>
}

export function mergeModules(index: SplitIndex, parts: ModulePart[]): Spec {
  return {
    codeAtlas: index.codeAtlas, sourceDigest: index.sourceDigest, frame: index.frame, fresh: index.fresh,
    systems: parts.flatMap((part) => part.systems).sort((first, second) => framePosition(first.position) - framePosition(second.position) || byText(first.name, second.name)),
    units: parts.flatMap((part) => part.units).sort((first, second) => byText(first.id, second.id)),
    edges: parts.flatMap((part) => part.edges),
    findings: parts.flatMap((part) => part.findings),
    tests: parts.flatMap((part) => part.tests),
    impacts: Object.assign({}, ...parts.map((part) => part.impacts)),
    modules: index.modules,
    links: index.links,
  }
}

export async function loadAtlas(): Promise<Spec> {
  try {
    return await fetchJson<Spec>('code-atlas.json')
  } catch {
    const index = await fetchJson<SplitIndex>('index.json')
    return mergeModules(index, await Promise.all(index.modules.map((module) => fetchJson<ModulePart>(module.file))))
  }
}
