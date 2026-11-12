import { UsersService } from './users.service'

declare function Controller(path: string): ClassDecorator
declare function Get(path: string): MethodDecorator

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  one(id: string): string { return this.users.find(id) }
}
