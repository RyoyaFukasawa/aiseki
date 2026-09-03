import { describe, expect, it } from "vitest"

import { createDB } from "../../src/database/client.js"
import type { Database } from "../../src/database/types.js"
import { Model } from "../../src/model/base.js"
import type {
  BoundModel,
  ModelConstructor,
} from "../../src/model/binding.js"

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

  it("hydrates after emitted fields and a custom constructor", async () => {
    class InitializedUser extends Model {
      static readonly table = "users"
      id!: number
      active = false
      readonly constructed: boolean

      constructor() {
        super({ id: -1, active: false })
        this.constructed = true
      }

      isActive(): boolean {
        return this.active
      }
    }
    const recorded = createDatabase([{ id: 7, active: true }])
    const BoundUser = createDB(recorded.database).model(InitializedUser)

    const user = await BoundUser.query().first()

    expect(user).toBeInstanceOf(InitializedUser)
    expect(user).toBeInstanceOf(BoundUser)
    expect(user?.constructed).toBe(true)
    expect(user?.id).toBe(7)
    expect(user?.active).toBe(true)
    expect(user?.isActive()).toBe(true)
  })

  it("preserves source static methods on the bound model class", () => {
    const BoundUser = createDB(createDatabase([]).database).model(User)
    const typedBoundUser: BoundModel<typeof User> = BoundUser

    expect(typedBoundUser.modelName()).toBe(BoundUser.name)
    expect(BoundUser).not.toBe(User)
    expect(Object.getPrototypeOf(BoundUser)).toBe(User)
  })

  it("allows source static methods to mutate bound static state", () => {
    class StatefulUser extends Model {
      static readonly table = "users"
      static status = "idle"

      static activate(): void {
        this.status = "active"
      }
    }
    const BoundUser = createDB(createDatabase([]).database).model(StatefulUser)

    BoundUser.activate()

    expect(BoundUser.status).toBe("active")
    expect(StatefulUser.status).toBe("idle")
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
    const BoundUser = createDB(recorded.database).model(User)

    const users = await BoundUser.query()
      .orderBy("id", "desc")
      .limit(2)
      .offset(1)
      .get()
    await BoundUser.query().where("id", ">", 0).update({ active: false })
    await BoundUser.query().where("id", ">", 0).delete()

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

  it("rejects model updates and deletes after select-only modifiers", async () => {
    const BoundUser = createDB(createDatabase([]).database).model(User)

    await expect(
      BoundUser.query()
        .where("id", 1)
        .limit(1)
        .update({ active: false }),
    ).rejects.toThrow(
      "Write queries do not support orderBy, limit, or offset",
    )
    await expect(
      BoundUser.query().where("id", 1).orderBy("id").delete(),
    ).rejects.toThrow(
      "Write queries do not support orderBy, limit, or offset",
    )
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
