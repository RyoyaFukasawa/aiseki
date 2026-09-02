import { describe, expect, it } from "vitest"

import { createDB } from "../src/client.js"
import type { Database } from "../src/database.js"
import { defineModel } from "../src/model/definition.js"

interface UserRow {
  id: number
  email: string
}

interface OrderRow {
  id: number
  userId: number
}

const modelDefinitions = {
  User: defineModel<UserRow>({ table: "users" }),
  Order: defineModel<OrderRow>({ table: "orders" }),
} as const

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
  it("preserves registry keys and binds every model to one DB client", async () => {
    const recorded = createRecordingDatabase([
      { id: 1, email: "a@example.com" },
    ])
    const DB = createDB(recorded.database)
    const models = DB.models(modelDefinitions)

    const user: UserRow | null = await models.User.query().first()
    const order: OrderRow | null = await models.Order.query().first()

    expect(user).toEqual({
      id: 1,
      email: "a@example.com",
    })
    expect(order).not.toBeNull()

    expect(Object.keys(models)).toEqual(["User", "Order"])
    expect(recorded.queries).toEqual([
      'select * from "users" limit ?',
      'select * from "orders" limit ?',
    ])
  })

  it("keeps two DB contexts isolated while reusing one definition registry", async () => {
    const first = createRecordingDatabase([{ id: 1 }])
    const second = createRecordingDatabase([{ id: 2 }])
    const firstUser = createDB(first.database).models(modelDefinitions).User
    const secondUser = createDB(second.database).models(modelDefinitions).User

    await firstUser.query().first()
    await secondUser.query().first()

    expect(first.queries).toHaveLength(1)
    expect(second.queries).toHaveLength(1)
  })

  it("does not mutate a frozen definition registry", () => {
    const definitions = Object.freeze({
      User: defineModel<UserRow>({ table: "users" }),
    })

    const models = createDB(createRecordingDatabase([]).database).models(
      definitions,
    )

    expect(models).not.toBe(definitions)
    expect(definitions).toEqual({
      User: expect.objectContaining({ table: "users" }),
    })
  })
})
