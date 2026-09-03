import { describe, expect, it } from "vitest"

import { createDB } from "../../src/database/client.js"
import type { Database } from "../../src/database/types.js"
import type { ModelConstructors } from "../../src/model/registry.js"
import { Model } from "../../src/model/base.js"

class User extends Model {
  static readonly table = "users"
  declare id: number
  declare email: string
}

class Order extends Model {
  static readonly table = "orders"
  declare id: number
  declare userId: number
}

const modelConstructors = { User, Order } as const

function createRecordingDatabase(rows: ReadonlyArray<object>) {
  const queries: string[] = []
  const database: Database = {
    async exec() {},
    async run() {},
    async all<T extends object>(sql: string) {
      queries.push(sql)
      return rows as ReadonlyArray<T>
    },
  }

  return { database, queries }
}

describe("model registry", () => {
  it("preserves registry keys and binds every model class to one DB client", async () => {
    const recorded = createRecordingDatabase([
      { id: 1, email: "a@example.com", userId: 1 },
    ])
    const models = createDB(recorded.database).models(modelConstructors)

    const user: User | null = await models.User.query().first()
    const order: Order | null = await models.Order.query().first()

    expect(user).toBeInstanceOf(User)
    expect(user?.email).toBe("a@example.com")
    expect(order).toBeInstanceOf(Order)
    expect(Object.keys(models)).toEqual(["User", "Order"])
    expect(recorded.queries).toEqual([
      'select * from "users" limit ?',
      'select * from "orders" limit ?',
    ])
  })

  it("keeps concurrent DB contexts isolated while reusing source classes", async () => {
    const first = createRecordingDatabase([{ id: 1, email: "first@example.com" }])
    const second = createRecordingDatabase([{ id: 2, email: "second@example.com" }])
    const firstUser = createDB(first.database).models(modelConstructors).User
    const secondUser = createDB(second.database).models(modelConstructors).User

    const [firstResult, secondResult] = await Promise.all([
      firstUser.query().first(),
      secondUser.query().first(),
    ])

    expect(firstResult?.id).toBe(1)
    expect(secondResult?.id).toBe(2)
    expect(first.queries).toEqual(['select * from "users" limit ?'])
    expect(second.queries).toEqual(['select * from "users" limit ?'])
    expect(User).not.toHaveProperty("database")
    expect(User).not.toHaveProperty("query")
  })

  it("does not mutate a frozen model constructor registry", () => {
    const constructors = Object.freeze({ User })

    const models = createDB(createRecordingDatabase([]).database).models(
      constructors,
    )

    expect(models).not.toBe(constructors)
    expect(constructors).toEqual({ User })
    expect(models.User).not.toBe(User)
  })

  it("rejects every malformed registry value at bind time", () => {
    const values: unknown[] = [
      undefined,
      null,
      { table: "users" },
      class MissingTable extends Model {},
      class InvalidTable extends Model {
        static readonly table = "unsafe table"
      },
      class NotAModel {
        static readonly table = "users"
        constructor(readonly row: object) {}
      },
    ]
    const DB = createDB(createRecordingDatabase([]).database)

    for (const value of values) {
      const constructors = { Broken: value } as unknown as ModelConstructors
      expect(() => DB.models(constructors)).toThrow(
        'Invalid model constructor for registry key "Broken"',
      )
    }
  })

  it("rejects symbol and non-enumerable own registry keys", () => {
    const symbolKey = Symbol("Hidden")
    const symbolConstructors = { User, [symbolKey]: Order }
    const nonEnumerableConstructors = Object.defineProperty({}, "User", {
      configurable: true,
      enumerable: false,
      value: User,
    }) as { User: typeof User }
    const DB = createDB(createRecordingDatabase([]).database)

    expect(() => DB.models(symbolConstructors)).toThrow(
      "Model registry keys must be strings",
    )
    expect(() => DB.models(nonEnumerableConstructors)).toThrow(
      'Model registry key "User" must be enumerable',
    )
  })

  it("preserves arbitrary own enumerable string keys", () => {
    const constructors = { "User model": User } as const
    const DB = createDB(createRecordingDatabase([]).database)

    expect(Object.keys(DB.models(constructors))).toEqual(["User model"])
  })
})
