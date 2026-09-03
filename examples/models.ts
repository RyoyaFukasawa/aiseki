import { Model } from "aiseki"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Drizzleのtable定義を、Modelの型情報と実行時metadataのsource of truthにする。 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  status: text("status").notNull(),
  passwordHash: text("password_hash").notNull(),
})

/** アプリケーションの振る舞いをModel classへまとめる。 */
export class User extends Model<typeof users> {
  static readonly table = users
  static readonly primaryKey = users.id
  static readonly hidden = ["passwordHash"] as const

  declare id: number
  declare email: string
  declare status: string
  declare passwordHash: string

  emailDomain(): string {
    return this.email.split("@")[1] ?? ""
  }

  isActive(): boolean {
    return this.status === "active"
  }
}

/** requestごとにdatabaseへbindするModel registry。 */
export const modelDefinitions = { User } as const
