import { Frozen, Position } from '../../components'
import { addComponent, defineQuery, type World } from '../../world'

const placedQuery = defineQuery([Position])

export function freezeSystem(world: World): void {
  for (const entity of placedQuery(world)) if (Position.x[entity] > 10) addComponent(world, entity, Frozen)
}
