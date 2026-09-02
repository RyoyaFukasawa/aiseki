import { describe, expect, it } from "vitest"

import { createDB } from "../src/client.js"
import type { Database } from "../src/database.js"

describe("Aiseki DB client", () => {
  it("adds query without changing the raw Database contract", async () => {
    const calls: string[] = []
    const database: Database = {
      async exec(sql) {
        calls.push(sql)
      },
      async run(sql) {
        calls.push(sql)
      },
      async all<T extends object>() {
        return [{ id: 1 }] as unknown as ReadonlyArray<T>
      },
    }

    const DB = createDB(database)
    const rows = await DB.query<{ id: number }>("users").get()

    expect(rows).toEqual([{ id: 1 }])
    await DB.exec("select 1")
    expect(calls).toEqual(["select 1"])
  })

  it("does not mutate the underlying adapter", () => {
    const database: Database = {
      async exec() {},
      async run() {},
      async all() {
        return []
      },
    }

    const DB = createDB(database)

    expect(database).not.toHaveProperty("query")
    expect(DB).not.toBe(database)
  })

  it("preserves the adapter method receiver", async () => {
    const calls: string[] = []
    const database: Database & { calls: string[] } = {
      calls,
      async exec(sql) {
        this.calls.push(sql)
      },
      async run(sql) {
        this.calls.push(sql)
      },
      async all<T extends object>(sql: string) {
        this.calls.push(sql)
        return [] as ReadonlyArray<T>
      },
    }

    const DB = createDB(database)
    await DB.exec("one")
    await DB.run("two")
    await DB.all("three")

    expect(calls).toEqual(["one", "two", "three"])
  })

  it("preserves concrete receiver-sensitive adapter capabilities", async () => {
    class ConcreteDatabase implements Database {
      readonly #events: string[] = []

      async exec(sql: string) {
        this.#events.push(`exec:${sql}`)
      }

      async run(sql: string) {
        this.#events.push(`run:${sql}`)
      }

      async all<T extends object>(sql: string) {
        this.#events.push(`all:${sql}`)
        return [] as ReadonlyArray<T>
      }

      events() {
        return this.#events
      }
    }

    const database = new ConcreteDatabase()
    const DB = createDB(database)

    await DB.exec("one")
    expect(DB.events()).toEqual(["exec:one"])
    expect(database).not.toHaveProperty("query")
  })
})
