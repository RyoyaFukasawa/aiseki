import { describe, expect, it } from "vitest"
import type {
  ClosableDatabase,
  Database,
  SqlParameter,
} from "../../src/database/types.js"

describe("Database boundary", () => {
  it("does not require runtime-specific lifecycle methods", async () => {
    const calls: string[] = []
    const database: Database = {
      async exec(sql) {
        calls.push(sql)
      },
      async run(sql, parameters) {
        calls.push(`${sql}:${parameters?.join(",") ?? ""}`)
        return { changes: 0, lastInsertId: null }
      },
      async all<T extends object = Record<string, unknown>>(
        _sql: string,
        _parameters?: readonly SqlParameter[],
      ) {
        return [{ id: 1, name: "Taro" }] as unknown as ReadonlyArray<T>
      },
    }

    await database.exec("select 1")
    const rows = await database.all<{ id: number; name: string }>("select", [])

    expect(rows).toEqual([{ id: 1, name: "Taro" }])
    expect(calls).toEqual(["select 1"])
  })

  it("supports closing as an optional adapter capability", async () => {
    const calls: string[] = []
    const database: ClosableDatabase = {
      async exec() {},
      async run() {
        return { changes: 0, lastInsertId: null }
      },
      async all() {
        return []
      },
      async close() {
        calls.push("close")
      },
    }

    await database.close()

    expect(calls).toEqual(["close"])
  })
})
