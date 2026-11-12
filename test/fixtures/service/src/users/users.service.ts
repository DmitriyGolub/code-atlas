declare function Injectable(): ClassDecorator

@Injectable()
export class UsersService {
  find(id: string): string { return this.normalize(id) }
  private normalize(id: string): string { return id.trim() }
}
