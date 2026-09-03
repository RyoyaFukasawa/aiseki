import { afterEach, describe, expect, it } from "vitest"

import type { Database, TransactionalDatabase } from "../../src/database/types.js"
import { createBetterSqlite3Database } from "../../src/drivers/better-sqlite3/index.js"
import { Migrator } from "../../src/migrations/index.js"
import { createSchema } from "../../src/schema/builder.js"

const databases: Array<ReturnType<typeof createBetterSqlite3Database>> = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()))
})

describe("Schema Builder", () => {
  it("emits deterministic SQLite SQL for column modifiers and indexes", async () => {
    const statements: string[] = []
    const schema = createSchema({
      async exec(sql: string) {
        statements.push(sql)
      },
    })

    await schema.createTable("users", (table) => {
      table.id()
      table.string("name")
      table.text("bio").nullable()
      table.integer("login_count").defaultTo(0)
      table.boolean("active").defaultTo(true)
      table.string("email").unique()
      table.text("external_id").primary()
      table.timestamps()
    })
    await schema.dropTable("users")

    expect(statements).toEqual([
      'create table "users" ("id" integer primary key autoincrement, "name" text not null, "bio" text, "login_count" integer not null default 0, "active" integer not null default 1, "email" text not null, "external_id" text primary key, "created_at" text not null, "updated_at" text not null)',
      'create unique index "users_email_unique" on "users" ("email")',
      'drop table "users"',
    ])
  })

  it("rejects unsafe table and column identifiers", async () => {
    const schema = createSchema({
      async exec() {},
    })

    await expect(
      schema.createTable("users; drop table users", () => {}),
    ).rejects.toThrow("Invalid identifier: users; drop table users")
    await expect(
      schema.createTable("users", (table) => {
        table.string("email address")
      }),
    ).rejects.toThrow("Invalid identifier: email address")
  })

  it("rejects empty table definitions before executing SQL", async () => {
    const statements: string[] = []
    const schema = createSchema({
      async exec(sql: string) {
        statements.push(sql)
      },
    })

    await expect(schema.createTable("empty", () => {})).rejects.toThrow(
      'Table "empty" must define at least one column',
    )
    expect(statements).toEqual([])
  })

  it("escapes string defaults and compiles null defaults", async () => {
    const statements: string[] = []
    const schema = createSchema({
      async exec(sql: string) {
        statements.push(sql)
      },
    })

    await schema.createTable("defaults", (table) => {
      table.string("display_name").defaultTo("O'Reilly")
      table.text("deleted_at").nullable().defaultTo(null)
    })

    expect(statements).toEqual([
      `create table "defaults" ("display_name" text not null default 'O''Reilly', "deleted_at" text default null)`,
    ])
  })

  it("rejects non-finite numeric defaults before executing SQL", async () => {
    const statements: string[] = []
    const schema = createSchema({
      async exec(sql: string) {
        statements.push(sql)
      },
    })

    await expect(
      schema.createTable("invalid_defaults", (table) => {
        table.integer("attempts").defaultTo(Number.NaN)
      }),
    ).rejects.toThrow("Default number must be finite")
    expect(statements).toEqual([])
  })

  it("supplies a schema builder to migrations on a raw transactional adapter", async () => {
    const statements: string[] = []
    const database: TransactionalDatabase = {
      async exec(sql: string) {
        statements.push(sql)
      },
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
        callback: (database: Database) => Promise<T> | T,
      ) {
        return callback(database)
      },
    }
    const migrator = new Migrator(database, [
      {
        name: "001_create_users",
        async up(migrationDatabase) {
          await migrationDatabase.schema.createTable("users", (table) => {
            table.id()
          })
        },
        async down() {},
      },
    ])

    await migrator.migrate()

    expect(statements).toContain(
      'create table "users" ("id" integer primary key autoincrement)',
    )
  })

  it("creates a table with common column definitions", async () => {
    const database = createBetterSqlite3Database(":memory:")
    databases.push(database)

    await database.schema.createTable("users", (table) => {
      table.id()
      table.string("name")
      table.string("email").unique()
      table.integer("age").nullable()
      table.boolean("active").defaultTo(true)
      table.timestamps()
    })

    const columns = await database.all<{
      name: string
      type: string
      notnull: number
      pk: number
    }>("pragma table_info(users)")

    expect(columns).toEqual([
      expect.objectContaining({
        name: "id",
        type: "INTEGER",
        notnull: 0,
        pk: 1,
      }),
      expect.objectContaining({
        name: "name",
        type: "TEXT",
        notnull: 1,
      }),
      expect.objectContaining({
        name: "email",
        type: "TEXT",
        notnull: 1,
      }),
      expect.objectContaining({
        name: "age",
        type: "INTEGER",
        notnull: 0,
      }),
      expect.objectContaining({
        name: "active",
        type: "INTEGER",
        notnull: 1,
      }),
      expect.objectContaining({
        name: "created_at",
        type: "TEXT",
        notnull: 1,
      }),
      expect.objectContaining({
        name: "updated_at",
        type: "TEXT",
        notnull: 1,
      }),
    ])

    const indexes = await database.all<{ name: string }>(
      "pragma index_list(users)",
    )

    expect(indexes).toEqual([
      expect.objectContaining({ name: "users_email_unique" }),
    ])
  })

  it("drops an existing table", async () => {
    const database = createBetterSqlite3Database(":memory:")
    databases.push(database)

    await database.schema.createTable("users", (table) => {
      table.id()
    })
    await database.schema.dropTable("users")

    const tables = await database.all<{ name: string }>(
      "select name from sqlite_master where type = 'table' and name = ?",
      ["users"],
    )

    expect(tables).toEqual([])
  })
})
