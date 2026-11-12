import { freezeSystem } from './move/freezeSystem'
import { moveSystem } from './move/moveSystem'
import { drawSystem } from './view/drawSystem'

export const pipeline = [moveSystem, freezeSystem, drawSystem]
