import { describe, expect, it } from "vitest"

import { createDB } from "../src/client.js"
import type { TransactionalDatabase } from "../src/database.js"
import {
  createD1Database,
  type D1DatabaseAdapter,
  type D1Transaction,
} from "../src/drivers/d1/index.js"

interface RecordedStatement {
  sql: string
  parameters: ReadonlyArray<unknown>
}

function createFakeD1(options: { batchError?: Error } = {}) {
  const batches: RecordedStatement[][] = []
  const executedSql: string[] = []
  const statements = new WeakMap<object, RecordedStatement>()

  function statement(sql: string, parameters: ReadonlyArray<unknown> = []) {
    const preparedStatement = {
      bind(...nextParameters: unknown[]) {
        return statement(sql, nextParameters)
      },
      async run() {
        throw new Error("D1 transaction statements must be executed by batch")
      },
      async all<T>() {
        if (sql.includes("select name from aiseki_migrations")) {
          return { results: [] as T[] }
        }
        if (sql.includes("coalesce(max(batch), 0)")) {
          return { results: [{ batch: 0 }] as T[] }
        }

        return { results: [] as T[] }
      },
    }

    statements.set(preparedStatement, { sql, parameters })
    return preparedStatement
  }

  return {
    batches,
    executedSql,
    database: {
      prepare(sql: string) {
        return statement(sql)
      },
      async exec(sql: string) {
        executedSql.push(sql)
      },
      async batch(preparedStatements: ReadonlyArray<object>) {
        const batch = preparedStatements.map((preparedStatement) => {
          const recorded = statements.get(preparedStatement)

          if (!recorded) {
            throw new Error("Unknown prepared statement")
          }

          return recorded
        })

        if (options.batchError) {
          throw options.batchError
        }

        batches.push(batch)
      },
    },
  }
}

describe("D1 database transactions", () => {
  it("preserves batch transactions after wrapping", async () => {
    const fake = createFakeD1()
    const DB = createDB(createD1Database(fake.database))

    await DB.transaction(async (transaction) => {
      await transaction.run("insert into users (name) values (?)", ["Taro"])
    })

    expect(fake.batches).toEqual([
      [
        {
          sql: "insert into users (name) values (?)",
          parameters: ["Taro"],
        },
      ],
    ])
  })

  it("does not expose a queryable transaction callback or TransactionalDatabase", () => {
    function assertTransactionTypes(database: D1DatabaseAdapter) {
      database.transaction(async (transaction) => {
        // @ts-expect-error D1 transactions only expose buffered writes.
        return transaction.all("select id from users")
      })

      function requiresTransactionalDatabase(
        currentDatabase: TransactionalDatabase,
      ) {
        return currentDatabase
      }

      // @ts-expect-error D1's write-only transaction is not a full Database transaction.
      requiresTransactionalDatabase(database)
    }

    expect(assertTransactionTypes).toBeTypeOf("function")
  })

  it("submits buffered exec and run statements as one atomic D1 batch", async () => {
    const fake = createFakeD1()
    const database = createD1Database(fake.database)

    await expect(
      database.transaction(async (transaction) => {
        await transaction.exec("create table users (id integer primary key)")
        await transaction.run("insert into users (name) values (?)", ["Taro"])

        return "saved"
      }),
    ).resolves.toBe("saved")

    expect(fake.batches).toEqual([
      [
        {
          sql: "create table users (id integer primary key)",
          parameters: [],
        },
        {
          sql: "insert into users (name) values (?)",
          parameters: ["Taro"],
        },
      ],
    ])
    expect(fake.executedSql).toEqual([])
  })

  it("does not submit buffered statements when the transaction callback fails", async () => {
    const fake = createFakeD1()
    const database = createD1Database(fake.database)

    await expect(
      database.transaction(async (transaction) => {
        await transaction.run("insert into users (name) values (?)", ["Taro"])
        throw new Error("transaction failed")
      }),
    ).rejects.toThrow("transaction failed")

    expect(fake.batches).toEqual([])
    expect(fake.executedSql).toEqual([])
  })

  it("rejects trigger-like multi-statement exec before submitting queued writes", async () => {
    const fake = createFakeD1()
    const database = createD1Database(fake.database)

    await expect(
      database.transaction(async (transaction) => {
        await transaction.run("insert into users (name) values (?)", ["Taro"])
        await transaction.exec(`
          create trigger users_after_insert after insert on users
          begin
            insert into audit_log (user_id) values (new.id);
            update counters set value = value + 1;
          end
        `)
      }),
    ).rejects.toThrow(
      "D1 transaction exec accepts exactly one SQL statement",
    )

    expect(fake.batches).toEqual([])
  })

  it("keeps non-transactional multi-statement exec unchanged", async () => {
    const fake = createFakeD1()
    const database = createD1Database(fake.database)
    const sql =
      "create table users (id integer primary key); create index users_id on users (id)"

    await database.exec(sql)

    expect(fake.executedSql).toEqual([sql])
  })

  it("propagates a D1 batch failure without exposing committed statements", async () => {
    const fake = createFakeD1({ batchError: new Error("D1 batch failed") })
    const database = createD1Database(fake.database)

    await expect(
      database.transaction(async (transaction) => {
        await transaction.run("insert into users (name) values (?)", ["Taro"])
      }),
    ).rejects.toThrow("D1 batch failed")

    expect(fake.batches).toEqual([])
  })

  it("batches migration-style exec and run calls", async () => {
    const fake = createFakeD1()
    const database = createD1Database(fake.database)

    await database.transaction(async (transaction: D1Transaction) => {
      await transaction.exec(
        "create table users (id integer primary key, name text not null)",
      )
      await transaction.run(
        "insert into aiseki_migrations (name, batch) values (?, ?)",
        ["001_create_users", 1],
      )
    })

    expect(fake.batches).toEqual([
      [
        {
          sql: "create table users (id integer primary key, name text not null)",
          parameters: [],
        },
        {
          sql: "insert into aiseki_migrations (name, batch) values (?, ?)",
          parameters: ["001_create_users", 1],
        },
      ],
    ])
    expect(fake.executedSql).toEqual([])
  })
})
