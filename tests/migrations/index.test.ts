import { describe, expect, it } from "vitest"

import type { Database, TransactionalDatabase } from "../../src/database/types.js"
import {
  defineMigrate,
  Migrator,
  type Migration,
} from "../../src/migrations/index.js"
import { createBetterSqlite3Database } from "../../src/drivers/better-sqlite3/index.js"

const migrations = [
  {
    name: "001_create_users",
    async up(database: Database) {
      await database.exec(
        "create table users (id integer primary key, name text not null)",
      )
    },
    async down(database: Database) {
      await database.exec("drop table users")
    },
  },
  {
    name: "002_create_posts",
    async up(database: Database) {
      await database.exec(
        "create table posts (id integer primary key, user_id integer not null)",
      )
    },
    async down(database: Database) {
      await database.exec("drop table posts")
    },
  },
] satisfies readonly Migration[]

describe("Migrator", () => {
  it("returns migration definitions from defineMigrate", () => {
    const migration = {
      name: "001_create_users",
      up() {},
      down() {},
    } satisfies Migration

    expect(defineMigrate(migration)).toBe(migration)
  })

  it("delegates migration atomicity to the database adapter", async () => {
    let transactionCalls = 0
    const database: TransactionalDatabase = {
      async exec() {},
      async run() {
        return { changes: 0, lastInsertId: null }
      },
      async all<T extends object>(sql: string) {
        if (sql.includes("coalesce(max(batch)")) {
          return [{ batch: 0 }] as unknown as ReadonlyArray<T>
        }

        return []
      },
      async transaction<T>(
        callback: (currentDatabase: Database) => Promise<T> | T,
      ) {
        transactionCalls += 1
        return callback(database)
      },
    }
    const migrator = new Migrator(database, [
      {
        name: "001_create_users",
        up() {},
        down() {},
      },
    ])

    await migrator.migrate()

    expect(transactionCalls).toBe(1)
  })

  it("applies pending migrations as one batch and rolls the batch back in reverse order", async () => {
    const database = createBetterSqlite3Database(":memory:")
    const migrator = new Migrator(database, migrations)

    await expect(migrator.migrate()).resolves.toEqual([
      "001_create_users",
      "002_create_posts",
    ])
    await expect(migrator.migrate()).resolves.toEqual([])
    await expect(migrator.rollback()).resolves.toEqual([
      "002_create_posts",
      "001_create_users",
    ])
    await database.close()
  })

  it("rolls back schema changes and bookkeeping when an up function fails", async () => {
    const database = createBetterSqlite3Database(":memory:")
    const failingMigrations = [
      migrations[0],
      {
        name: "002_fail",
        async up(currentDatabase: Database) {
          await currentDatabase.exec("create table posts (id integer primary key)")
          throw new Error("migration failed")
        },
        async down(currentDatabase: Database) {
          await currentDatabase.exec("drop table posts")
        },
      },
    ] satisfies readonly Migration[]
    const migrator = new Migrator(database, failingMigrations)

    await expect(migrator.migrate()).rejects.toThrow("migration failed")
    await expect(
      database.all(
        "select name from sqlite_master where type = 'table' and name = 'users'",
      ),
    ).resolves.toEqual([])
    await expect(database.all("select name from aiseki_migrations")).resolves.toEqual([])
    await database.close()
  })

  it("rejects rollback when an applied migration definition is missing", async () => {
    const database = createBetterSqlite3Database(":memory:")
    const migrator = new Migrator(database, [migrations[0]])

    await migrator.migrate()
    const incompleteMigrator = new Migrator(database, [])

    await expect(incompleteMigrator.rollback()).rejects.toThrow(
      "Applied migration is not defined: 001_create_users",
    )
    await expect(
      database.all("select name from aiseki_migrations"),
    ).resolves.toEqual([{ name: "001_create_users" }])
    await database.close()
  })
})
