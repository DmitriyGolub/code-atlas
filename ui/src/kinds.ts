import type { Unit } from './types'

const DECORATOR_LABELS: Record<string, string> = {
  Controller: 'controller', Injectable: 'service', Module: 'module', Catch: 'filter', Resolver: 'resolver', Gateway: 'gateway', WebSocketGateway: 'gateway',
  Component: 'angular component', Directive: 'directive', Pipe: 'pipe', NgModule: 'module', Entity: 'entity',
}
const ENDPOINT_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All', 'GrpcMethod', 'MessagePattern', 'EventPattern', 'Query', 'Mutation', 'Subscription', 'SubscribeMessage'])
const NAMED_KINDS = new Set(['system', 'component', 'rule', 'entity', 'query', 'config'])

interface KindRule {
  label: (unit: Unit) => string
  matches(unit: Unit, isClass: boolean): boolean
}

const RULES: KindRule[] = [
  { label: (unit) => unit.kind, matches: (unit) => NAMED_KINDS.has(unit.kind) },
  { label: () => 'endpoint', matches: (unit) => unit.kind === 'method' && (unit.decorators ?? []).some((name) => ENDPOINT_DECORATORS.has(name)) },
  { label: () => 'method', matches: (unit) => unit.kind === 'method' },
  { label: (unit) => DECORATOR_LABELS[(unit.decorators ?? []).find((name) => name in DECORATOR_LABELS)!], matches: (unit) => (unit.decorators ?? []).some((name) => name in DECORATOR_LABELS) },
  { label: () => 'class', matches: (_, isClass) => isClass },
  { label: () => 'hook', matches: (unit) => /^use[A-Z]/.test(unit.name) },
  { label: () => 'constant', matches: (unit) => /^[A-Z][A-Z0-9_]*$/.test(unit.name) },
  { label: () => 'react component', matches: (unit) => /^[A-Z]/.test(unit.name) && unit.file.endsWith('.tsx') },
  { label: () => 'value', matches: (unit) => /^[A-Z]/.test(unit.name) },
  { label: () => 'function', matches: () => true },
]

let classes = new Set<string>()

export const registerClasses = (units: Unit[]): void => { classes = new Set(units.map((unit) => unit.owner).filter((owner): owner is string => !!owner)) }

export const kindLabel = (unit: Unit): string => {
  const isClass = classes.has(unit.id) || !!unit.decorators?.length && unit.kind !== 'method'
  return RULES.find((rule) => rule.matches(unit, isClass))!.label(unit)
}
