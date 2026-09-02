import { describe, expect, it } from "vitest"
import { createDB } from "../src/client.js"
import { createBetterSqlite3Database } from "../src/drivers/better-sqlite3/index.js"

describe("SQLite database", () => {
  it("executes statements on one in-memory connection", async () => {
    const database = createBetterSqlite3Database(":memory:")

    await database.exec("create table users (id integer primary key, name text not null)")
    await database.exec("insert into users (name) values ('Taro')")

    await expect(database.all("select id, name from users")).resolves.toEqual([
      { id: 1, name: "Taro" },
    ])

    await database.close()
  })

  it("rolls back a transaction when its callback fails", async () => {
    const database = createBetterSqlite3Database(":memory:")

    await database.exec(
      "create table users (id integer primary key, name text not null)",
    )

    await expect(
      database.transaction(async (transaction) => {
        await transaction.run("insert into users (name) values (?)", ["Taro"])
        throw new Error("transaction failed")
      }),
    ).rejects.toThrow("transaction failed")

    await expect(database.all("select * from users")).resolves.toEqual([])

    await database.close()
  })

  it("preserves schema, transaction, and close after wrapping", async () => {
    const adapter = createBetterSqlite3Database(":memory:")
    const DB = createDB(adapter)

    await DB.schema.createTable("users", (table) => {
      table.id()
      table.string("name")
    })
    await DB.transaction(async (transaction) => {
      await transaction.run("insert into users (name) values (?)", ["Taro"])
    })

    await expect(DB.all("select id, name from users")).resolves.toEqual([
      { id: 1, name: "Taro" },
    ])
    await DB.close()
  })

  it("executes Query Builder writes and filters with boolean parameters", async () => {
    const DB = createDB(createBetterSqlite3Database(":memory:"))

    await DB.exec(
      "create table users (id integer primary key, active integer not null)",
    )
    await DB.query("users").insert({ active: true })

    await expect(
      DB.query<{ id: number; active: number }>("users")
        .where("active", true)
        .first(),
    ).resolves.toEqual({ id: 1, active: 1 })

    await DB.query("users").where("id", 1).update({ active: false })
    await expect(
      DB.query<{ id: number; active: number }>("users")
        .where("active", false)
        .first(),
    ).resolves.toEqual({ id: 1, active: 0 })

    await DB.close()
  })

  it("executes an offset-only Query Builder select", async () => {
    const DB = createDB(createBetterSqlite3Database(":memory:"))

    await DB.exec("create table users (id integer primary key, name text)")
    await DB.query("users").insert({ name: "First" })
    await DB.query("users").insert({ name: "Second" })

    await expect(
      DB.query<{ id: number; name: string }>("users")
        .orderBy("id")
        .offset(1)
        .get(),
    ).resolves.toEqual([{ id: 2, name: "Second" }])

    await DB.close()
  })

  it("selects, updates, and deletes rows through null predicates", async () => {
    const DB = createDB(createBetterSqlite3Database(":memory:"))

    await DB.exec(
      "create table users (id integer primary key, name text, deleted_at text)",
    )
    await DB.query("users").insert({ name: "Active", deleted_at: null })
    await DB.query("users").insert({
      name: "Deleted",
      deleted_at: "2026-01-01",
    })

    await expect(
      DB.query<{ id: number; name: string; deleted_at: string | null }>("users")
        .where("deleted_at", null)
        .get(),
    ).resolves.toEqual([{ id: 1, name: "Active", deleted_at: null }])

    await DB.query("users")
      .where("deleted_at", null)
      .update({ name: "Current" })
    await DB.query("users").where("deleted_at", "!=", null).delete()

    await expect(
      DB.query<{ id: number; name: string; deleted_at: string | null }>("users")
        .get(),
    ).resolves.toEqual([{ id: 1, name: "Current", deleted_at: null }])

    await DB.close()
  })
})
