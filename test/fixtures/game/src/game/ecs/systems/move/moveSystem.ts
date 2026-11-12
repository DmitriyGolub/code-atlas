import { Frozen, Position, Velocity } from '../../components'
import { defineQuery, Not, type World } from '../../world'

const movingQuery = defineQuery([Position, Velocity, Not(Frozen)])

/** Moves every entity by its velocity once per frame. */
export function moveSystem(world: World): void {
  for (const entity of movingQuery(world)) Position.x[entity] += Velocity.x[entity]
}
