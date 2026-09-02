import { describe, expect, it } from "vitest"
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
})
