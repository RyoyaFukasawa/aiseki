import { describe, expect, it } from "vitest"

import { createD1Database } from "../../src/drivers/d1/index.js"

function createFakeD1() {
  const events: string[] = []

  function statement(sql: string, parameters: readonly unknown[] = []) {
    return {
      bind(...nextParameters: unknown[]) {
        return statement(sql, nextParameters)
      },
      async run() {
        events.push(`run:${sql}:${parameters.join(",")}`)
        return {
          meta: {
            changes: 1,
            last_row_id: 1,
          },
        }
      },
      async all<T>() {
        events.push(`all:${sql}:${parameters.join(",")}`)
        return { results: [{ id: 1, name: "Taro" } as T] }
      },
    }
  }

  return {
    events,
    database: {
      prepare(sql: string) {
        return statement(sql)
      },
      async exec(sql: string) {
        events.push(`exec:${sql}`)
      },
    },
  }
}

describe("D1 database driver", () => {
  it("adapts D1's async prepared statement API to Database", async () => {
    const fake = createFakeD1()
    const database = createD1Database(fake.database)

    await database.exec("create table users (id integer primary key)")
    await expect(
      database.run("insert into users (name) values (?)", ["Taro"]),
    ).resolves.toEqual({ changes: 1, lastInsertId: 1 })
    await expect(
      database.all<{ id: number; name: string }>(
        "select id, name from users where name = ?",
        ["Taro"],
      ),
    ).resolves.toEqual([{ id: 1, name: "Taro" }])

    expect(fake.events).toEqual([
      "exec:create table users (id integer primary key)",
      "run:insert into users (name) values (?):Taro",
      "all:select id, name from users where name = ?:Taro",
    ])
  })
})
