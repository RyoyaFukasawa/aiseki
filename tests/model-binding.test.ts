import { describe, expect, it } from "vitest"

import { createDB } from "../src/client.js"
import type { Database } from "../src/database.js"
import { Model } from "../src/model/model.js"
import type {
  BoundModel,
  ModelConstructor,
} from "../src/model/binding.js"

class User extends Model {
  static readonly table = "users"
  declare id: number
  declare email: string
  declare active: boolean

  emailDomain(): string {
    return this.email.split("@")[1] ?? ""
  }

  static modelName(): string {
    return this.name
  }
}

function createDatabase(rows: ReadonlyArray<object>) {
  const statements: Array<{ sql: string; parameters: readonly unknown[] }> = []
  const database: Database = {
    async exec() {},
    async run(sql, parameters = []) {
      statements.push({ sql, parameters })
    },
    async all<T extends object>(sql: string, parameters = []) {
      statements.push({ sql, parameters })
      return rows as ReadonlyArray<T>
    },
  }

  return { database, statements }
}

describe("class-based model binding", () => {
  it("exposes model constructor types", () => {
    const constructor: ModelConstructor<User> = User

    expect(constructor).toBe(User)
  })

  it("does not expose partial projections on hydrated model queries", () => {
    function assertModelQueryTypes(database: Database) {
      const query = createDB(database).model(User).query()

      // @ts-expect-error Model queries must hydrate complete model rows.
      query.select("id")
    }

    expect(assertModelQueryTypes).toBeTypeOf("function")
  })

  it("hydrates fields into subclass instances with instance methods", async () => {
    const recorded = createDatabase([
      { id: 1, email: "a@example.com", active: true },
    ])
    const BoundUser = createDB(recorded.database).model(User)

    const user: User | null = await BoundUser.query().where("id", 1).first()

    expect(user).toBeInstanceOf(User)
    expect(user).toBeInstanceOf(BoundUser)
    expect(user?.id).toBe(1)
    expect(user?.email).toBe("a@example.com")
    expect(user?.active).toBe(true)
    expect(user?.emailDomain()).toBe("example.com")
  })

  it("preserves source static methods on the bound model class", () => {
    const BoundUser = createDB(createDatabase([]).database).model(User)
    const typedBoundUser: BoundModel<typeof User> = BoundUser

    expect(typedBoundUser.modelName()).toBe(BoundUser.name)
    expect(BoundUser).not.toBe(User)
    expect(Object.getPrototypeOf(BoundUser)).toBe(User)
  })

  it("adds a static query method only to the request-bound model", async () => {
    const recorded = createDatabase([])
    const BoundUser = createDB(recorded.database).model(User)

    expect(User).not.toHaveProperty("query")
    await BoundUser.query().where("active", true).get()

    expect(recorded.statements).toEqual([
      {
        sql: 'select * from "users" where "active" = ?',
        parameters: [true],
      },
    ])
  })

  it("hydrates every row and delegates writes through existing query behavior", async () => {
    const recorded = createDatabase([
      { id: 1, email: "one@example.com", active: true },
      { id: 2, email: "two@example.com", active: false },
    ])
    const query = createDB(recorded.database).model(User).query()

    const users = await query.orderBy("id", "desc").limit(2).offset(1).get()
    await query.where("id", ">", 0).update({ active: false })
    await query.delete()

    expect(users).toHaveLength(2)
    expect(users.every((user) => user instanceof User)).toBe(true)
    expect(recorded.statements).toEqual([
      {
        sql: 'select * from "users" order by "id" desc limit ? offset ?',
        parameters: [2, 1],
      },
      {
        sql: 'update "users" set "active" = ? where "id" > ?',
        parameters: [false, 0],
      },
      {
        sql: 'delete from "users" where "id" > ?',
        parameters: [0],
      },
    ])
  })

  it("rejects invalid model classes when binding a single model", () => {
    class UnsafeUser extends Model {
      static readonly table = "unsafe table"
    }

    expect(() => createDB(createDatabase([]).database).model(UnsafeUser)).toThrow(
      "Invalid model constructor",
    )
  })
})
