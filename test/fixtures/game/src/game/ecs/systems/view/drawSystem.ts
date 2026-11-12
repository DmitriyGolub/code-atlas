import { Frozen, Position } from '../../components'
import { defineQuery, type World } from '../../world'

const frozenQuery = defineQuery([Position, Frozen])

export function drawSystem(world: World): number[] {
  return frozenQuery(world).map((entity) => Position.x[entity])
}
