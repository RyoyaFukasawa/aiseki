import { Model } from "aiseki"

export class User extends Model {
  static readonly table = "users"
  declare id: number

  isFirstUser(): boolean {
    return this.id === 1
  }
}

export const models = {
  User,
} as const
