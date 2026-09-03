import Sqlite from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { describe, expect, expectTypeOf, it } from "vitest"

import { Model } from "../../src/model/base.js"
import { createDB } from "../../src/adapter/drizzle/index.js"

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  status: text("status").notNull(),
})

class User extends Model<typeof users> {
  static readonly table = users
  static readonly primaryKey = users.id

  declare id: number
  declare email: string
  declare status: string

  emailDomain(): string {
    return this.email.split("@")[1] ?? ""
  }
}

function createTestDatabase() {
  const sqlite = new Sqlite(":memory:")
  sqlite.exec(`
    create table users (
      id integer primary key,
      email text not null,
      status text not null
    )
  `)
  sqlite
    .prepare("insert into users (id, email, status) values (?, ?, ?)")
    .run(1, "user@example.com", "active")
  sqlite
    .prepare("insert into users (id, email, status) values (?, ?, ?)")
    .run(2, "other@example.com", "inactive")

  return {
    sqlite,
    db: drizzle(sqlite),
  }
}

describe("Drizzle Model binding", () => {
  it("hydrates a Drizzle row into a request-bound Model instance", async () => {
    const { db, sqlite } = createTestDatabase()
    const DB = createDB(db)
    const { User: BoundUser } = DB.models({ User })

    const user = await BoundUser.query()
      .where(eq(users.email, "user@example.com"))
      .first()

    expectTypeOf(user).toEqualTypeOf<User | null>()
    expect(user).toBeInstanceOf(User)
    expect(user?.id).toBe(1)
    expect(user?.getKey()).toBe(1)
    expect(user?.emailDomain()).toBe("example.com")
    expect(User).not.toHaveProperty("query")

    sqlite.close()
  })

  it("provides find and findOrFail through the Model query", async () => {
    const { db, sqlite } = createTestDatabase()
    const DB = createDB(db)
    const { User: BoundUser } = DB.models({ User })

    await expect(BoundUser.find(2)).resolves.toMatchObject({
      id: 2,
      email: "other@example.com",
    })
    await expect(BoundUser.find(999)).resolves.toBeNull()
    await expect(BoundUser.findOrFail(999)).rejects.toThrow(
      'User with primary key "999" not found',
    )

    sqlite.close()
  })
})
