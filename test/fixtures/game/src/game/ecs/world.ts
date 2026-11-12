export interface World { entities: number[] }
export const defineQuery = (terms: unknown[]) => (world: World) => (terms.length ? world.entities : [])
export const addComponent = (world: World, entity: number, component: object) => world.entities.includes(entity) && component
export const Not = (component: object) => component
