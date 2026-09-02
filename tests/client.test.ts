import { describe, expect, it } from "vitest"

import { createDB } from "../src/client.js"
import type { Database } from "../src/database.js"

type ReservedMethodName = "query" | "model" | "models"

function createDatabaseWithReservedPrototypeCollision(
  name: ReservedMethodName,
): Database {
  const prototype = {}
  const descriptor: PropertyDescriptor = name === "model"
    ? {
        configurable: true,
        value: "adapter model",
        writable: false,
      }
    : {
        configurable: true,
        get() {
          return `adapter ${name}`
        },
      }

  Object.defineProperty(prototype, name, descriptor)

  return Object.assign(Object.create(prototype) as object, {
    async exec() {},
    async run() {},
    async all() {
      return []
    },
  }) as Database
}

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

  it.each<ReservedMethodName>(["query", "model", "models"])(
    "installs its own %s method over an inherited adapter collision",
    (name) => {
      const database = createDatabaseWithReservedPrototypeCollision(name)
      const DB = createDB(database)

      expect(Object.hasOwn(DB, name)).toBe(true)
      expect(Reflect.get(DB, name)).toBeTypeOf("function")
      expect(Reflect.get(database, name)).toBe(`adapter ${name}`)
    },
  )

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

  it("forwards property writes to the raw adapter with its receiver", () => {
    type MutableDatabase = Database & {
      backingState: string
      state?: string
    }
    const database: MutableDatabase = {
      backingState: "initial",
      get state() {
        return this.backingState
      },
      set state(value: string | undefined) {
        this.backingState = value ?? "unset"
      },
      async exec() {},
      async run() {},
      async all() {
        return []
      },
    }
    const DB = createDB(database)

    DB.state = "updated"

    expect(database.state).toBe("updated")
    expect(database.backingState).toBe("updated")
  })

  it("forwards property deletion to the raw adapter", () => {
    const database: Database & { state?: string } = {
      state: "initial",
      async exec() {},
      async run() {},
      async all() {
        return []
      },
    }
    const DB = createDB(database)

    expect(delete DB.state).toBe(true)
    expect(Object.hasOwn(database, "state")).toBe(false)
    expect("state" in DB).toBe(false)
  })

  it("wraps a frozen plain-object adapter without Proxy invariant errors", async () => {
    const calls: string[] = []
    const database = Object.freeze({
      async exec(sql: string) {
        calls.push(`exec:${sql}`)
      },
      async run(sql: string) {
        calls.push(`run:${sql}`)
      },
      async all<T extends object>(sql: string) {
        calls.push(`all:${sql}`)
        return [{ id: 1 }] as unknown as ReadonlyArray<T>
      },
    })

    const DB = createDB(database)

    await DB.exec("one")
    await DB.run("two")
    await expect(DB.all<{ id: number }>("three")).resolves.toEqual([{ id: 1 }])
    expect(calls).toEqual(["exec:one", "run:two", "all:three"])
    expect(Object.getPrototypeOf(DB)).toBe(Object.getPrototypeOf(database))
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
    expect(DB).toBeInstanceOf(ConcreteDatabase)
    expect(database).not.toHaveProperty("query")
  })
})
