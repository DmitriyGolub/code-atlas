import { moveSystem } from '../src/game/ecs/systems/move/moveSystem'

declare const it: (title: string, body: () => void) => void

it('moves an entity by its velocity', () => moveSystem({ entities: [0] }))
