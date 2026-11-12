import type { Test } from './types'
import type { Model } from './model'

const MAX_DEPTH = 4
const MAX_SYMBOLS = 400

export interface Coverage {
  direct: Test[]
  indirect: { test: Test; through: string; depth: number }[]
}

export function coverageOf(model: Model, id: string): Coverage {
  const direct = model.testsOf(id)
  const seen = new Set([id])
  const found = new Map<string, { test: Test; through: string; depth: number }>()
  for (const test of direct) found.set(`${test.file}:${test.line}`, { test, through: '', depth: 0 })
  let frontier = [id]
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length && seen.size < MAX_SYMBOLS; depth++) {
    const next: string[] = []
    for (const current of frontier) {
      for (const caller of model.units.get(current)?.callers ?? []) {
        if (seen.has(caller.unit) || !model.units.has(caller.unit)) continue
        seen.add(caller.unit)
        next.push(caller.unit)
        for (const test of model.testsOf(caller.unit)) {
          const key = `${test.file}:${test.line}`
          if (!found.has(key)) found.set(key, { test, through: caller.name, depth })
        }
      }
    }
    frontier = next
  }
  return { direct, indirect: [...found.values()].filter((entry) => entry.depth > 0) }
}
