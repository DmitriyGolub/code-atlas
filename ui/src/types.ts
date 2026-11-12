export interface Location {
  file: string
  line: number
}

export interface Access extends Location {
  value: string
  excluded?: boolean
}

export interface Query extends Location {
  name: string
  terms: string[]
}

export interface Caller extends Location {
  unit: string
  name: string
}

export interface Unit extends Location {
  id: string
  name: string
  kind: string
  planned?: boolean
  exported?: boolean
  lines?: number
  complexity?: number
  doc?: string
  decorators?: string[]
  owner?: string
  callers: Caller[]
  calls?: Caller[]
}

export interface System extends Unit {
  domain: string
  position: number
  phase: 'simulation' | 'view'
  mode: string
  queries: Query[]
  reads: Access[]
  writes: Access[]
  adds: Access[]
  removes: Access[]
  eventReads: Access[]
  eventWrites: Access[]
  ports: Access[]
  rules: Access[]
  creates: Access[]
}

export type EdgeKind = 'event' | 'tag' | 'field'

export interface Edge {
  from: string
  to: string
  via: string
  kind: EdgeKind
  hub: boolean
  nextFrame: boolean
  excluded?: boolean
}

export type FindingKind = 'next-frame' | 'wide' | 'write-only'

export interface Finding extends Location {
  kind: FindingKind
  system: string
  text: string
}

export interface Test extends Location {
  title: string
  symbols?: string[]
}

export interface Impact {
  executing: string[]
  readers: { name: string; through: string[] }[]
  writers: { name: string; accesses: Access[] }[]
  contracts: (Location & { name: string })[]
  writesFields: string[]
  writesTags: string[]
  emits: string[]
  tests: Test[]
  simulationTests: number
}

export interface Spec {
  codeAtlas: string
  sourceDigest: string
  frame: string[]
  systems: System[]
  units: Unit[]
  edges: Edge[]
  findings: Finding[]
  tests: Test[]
  impacts: Record<string, Impact>
  fresh?: string[]
  modules?: import('./modules').ModuleInfo[]
  links?: import('./modules').ModuleLink[]
}

export type EditorName = 'vscode' | 'cursor' | 'webstorm' | 'zed'

export interface ViewerOptions {
  root?: string
  editor?: EditorName
  syncHash?: boolean
}
