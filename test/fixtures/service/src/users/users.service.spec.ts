import { UsersService } from './users.service'

declare const it: { each: (rows: string[]) => (title: string, body: (id: string) => void) => void }

it.each(['a', 'b'])('finds user %s', (id) => { new UsersService().find(id) })
