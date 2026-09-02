import { describe, expect, it } from "vitest"

import type { Database } from "../src/database.js"
import { createQueryBuilder } from "../src/query-builder.js"

const inertDatabase: Database = {
  async exec() {},
  async run() {},
  async all() {
    return []
  },
}

describe("Query Builder", () => {
  it("builds and executes a typed select query", async () => {
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = []
    const database: Database = {
      async exec() {},
      async run(sql, parameters = []) {
        calls.push({ sql, parameters })
      },
      async all<T extends object>(sql: string, parameters = []) {
        calls.push({ sql, parameters })
        return [{ id: 1, email: "a@example.com" }] as unknown as ReadonlyArray<T>
      },
    }

    const rows = await createQueryBuilder<{ id: number; email: string }>(
      database,
      "users",
    )
      .select("id", "email")
      .where("email", "a@example.com")
      .get()

    expect(rows).toEqual([{ id: 1, email: "a@example.com" }])
    expect(calls).toEqual([
      {
        sql: 'select "id", "email" from "users" where "email" = ?',
        parameters: ["a@example.com"],
      },
    ])
  })

  it("returns only the first row without mutating the builder limit", async () => {
    const queries: string[] = []
    const database: Database = {
      async exec() {},
      async run() {},
      async all<T extends object>(sql: string) {
        queries.push(sql)
        return [] as ReadonlyArray<T>
      },
    }

    const builder = createQueryBuilder(database, "users").where("active", true)

    await builder.first()
    await builder.get()

    expect(queries).toEqual([
      'select * from "users" where "active" = ? limit ?',
      'select * from "users" where "active" = ?',
    ])
  })

  it("returns the first row or null", async () => {
    const rows = [{ id: 1 }, { id: 2 }]
    const database: Database = {
      async exec() {},
      async run() {},
      async all<T extends object>() {
        return rows as unknown as ReadonlyArray<T>
      },
    }

    await expect(createQueryBuilder(database, "users").first()).resolves.toEqual(
      { id: 1 },
    )

    database.all = async <T extends object>() => [] as ReadonlyArray<T>
    await expect(createQueryBuilder(database, "users").first()).resolves.toBeNull()
  })

  it("executes parameterized insert, update, and delete queries", async () => {
    const statements: Array<{ sql: string; parameters: readonly unknown[] }> = []
    const database: Database = {
      async exec() {},
      async run(sql, parameters = []) {
        statements.push({ sql, parameters })
      },
      async all() {
        return []
      },
    }

    await createQueryBuilder(database, "users").insert({ name: "Taro" })
    await createQueryBuilder(database, "users")
      .where("id", 1)
      .update({ name: "Jiro" })
    await createQueryBuilder(database, "users").where("id", 1).delete()

    expect(statements).toEqual([
      {
        sql: 'insert into "users" ("name") values (?)',
        parameters: ["Taro"],
      },
      {
        sql: 'update "users" set "name" = ? where "id" = ?',
        parameters: ["Jiro", 1],
      },
      {
        sql: 'delete from "users" where "id" = ?',
        parameters: [1],
      },
    ])
  })

  it("supports explicit comparison operators and select modifiers", () => {
    expect(
      createQueryBuilder(inertDatabase, "users")
        .where("created_at", ">=", 10)
        .orderBy("created_at")
        .limit(5)
        .offset(2)
        .toSQL(),
    ).toEqual({
      sql: 'select * from "users" where "created_at" >= ? order by "created_at" asc limit ? offset ?',
      parameters: [10, 5, 2],
    })
  })

  it("validates fluent input before changing builder state", () => {
    const builder = createQueryBuilder(inertDatabase, "users")

    expect(() => builder.select("unsafe column")).toThrow("Invalid identifier")
    expect(() => builder.where("unsafe column", 1)).toThrow("Invalid identifier")
    expect(() => builder.orderBy("created_at", "sideways" as "asc")).toThrow(
      "Invalid order direction",
    )
    expect(() => builder.limit(-1)).toThrow(
      "Limit must be a non-negative integer",
    )
    expect(builder.toSQL()).toEqual({
      sql: 'select * from "users"',
      parameters: [],
    })
  })
})
