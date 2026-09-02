import { describe, expect, it } from "vitest"

import { createDB } from "../src/client.js"
import type { Database } from "../src/database.js"
import { defineModel } from "../src/model/definition.js"

interface UserRow {
  id: number
  email: string
}

class User {
  constructor(
    readonly id: number,
    readonly email: string,
  ) {}
}

describe("model binding", () => {
  it("defines a model without a database and hydrates query results", async () => {
    const database: Database = {
      async exec() {},
      async run() {},
      async all<T extends object>() {
        return [{ id: 1, email: "a@example.com" }] as unknown as ReadonlyArray<T>
      },
    }
    const DB = createDB(database)
    const userDefinition = defineModel<UserRow>({ table: "users" })
    const UserModel = DB.model(userDefinition)

    const user: UserRow | null = await UserModel.query().where("id", 1).first()

    expect(Object.isFrozen(UserModel)).toBe(true)
    expect(user).toEqual({ id: 1, email: "a@example.com" })
  })

  it("supports an explicit hydrator without storing a database in the definition", async () => {
    const database: Database = {
      async exec() {},
      async run() {},
      async all<T extends object>() {
        return [{ id: 1, email: "A@EXAMPLE.COM" }] as unknown as ReadonlyArray<T>
      },
    }
    const DB = createDB(database)
    const userDefinition = defineModel<UserRow, User>({
      table: "users",
      hydrate: (row) => new User(row.id, row.email.toLowerCase()),
    })

    expect(userDefinition).not.toHaveProperty("database")
    const user: User | null = await DB.model(userDefinition).query().first()
    expect(user).toEqual(new User(1, "a@example.com"))
  })

  it("hydrates every selected row and delegates writes", async () => {
    const statements: Array<{ sql: string; parameters: readonly unknown[] }> = []
    const database: Database = {
      async exec() {},
      async run(sql, parameters = []) {
        statements.push({ sql, parameters })
      },
      async all<T extends object>() {
        return [
          { id: 1, email: "ONE@EXAMPLE.COM" },
          { id: 2, email: "TWO@EXAMPLE.COM" },
        ] as unknown as ReadonlyArray<T>
      },
    }
    const definition = defineModel<UserRow, User>({
      table: "users",
      hydrate: (row) => new User(row.id, row.email.toLowerCase()),
    })
    const query = createDB(database).model(definition).query()

    await expect(query.select("id", "email").get()).resolves.toEqual([
      new User(1, "one@example.com"),
      new User(2, "two@example.com"),
    ])
    await query.where("id", ">", 0).update({ email: "new@example.com" })
    await query.delete()

    expect(statements).toEqual([
      {
        sql: 'update "users" set "email" = ? where "id" > ?',
        parameters: ["new@example.com", 0],
      },
      {
        sql: 'delete from "users" where "id" > ?',
        parameters: [0],
      },
    ])
  })

  it("rejects invalid model table names", () => {
    expect(() => defineModel<UserRow>({ table: "unsafe table" })).toThrow(
      "Invalid identifier",
    )
  })
})
