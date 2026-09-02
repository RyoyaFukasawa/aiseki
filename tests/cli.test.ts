import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it } from "vitest"

import type { Database, TransactionalDatabase } from "../src/database.js"
import type { AisekiConfig } from "../src/cli/config.js"
import { runCli } from "../src/cli/index.js"
import { createBetterSqlite3Database } from "../src/drivers/better-sqlite3/index.js"
import type { Migration } from "../src/migrations.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

function createTestDirectory() {
  return mkdtemp(join(tmpdir(), "aiseki-cli-"))
}

function createConfig(
  database: () => TransactionalDatabase | Promise<TransactionalDatabase>,
  migrations = "database/migrations",
): AisekiConfig {
  return { database, migrations }
}

const migrations = [
  {
    name: "20260902120000_create_users",
    async up(database: Database) {
      await database.exec(
        "create table users (id integer primary key, name text not null)",
      )
    },
    async down(database: Database) {
      await database.exec("drop table users")
    },
  },
] satisfies readonly Migration[]

describe("Aiseki CLI", () => {
  it("creates a migration without an application config", async () => {
    const directory = await createTestDirectory()
    temporaryDirectories.push(directory)
    const output: string[] = []

    const exitCode = await runCli(["make:migration", "create_users_table"], {
      cwd: directory,
      now: () => new Date(2026, 8, 2, 12, 34, 56),
      output: (message) => output.push(message),
    })

    const migrationPath = join(
      directory,
      "database/migrations/20260902123456_create_users_table.ts",
    )

    await expect(readFile(migrationPath, "utf8")).resolves.toContain(
      'name: "20260902123456_create_users_table"',
    )
    expect(exitCode).toBe(0)
    expect(output[0]).toContain("Migration created")
  })

  it("creates a timestamped migration file", async () => {
    const directory = await createTestDirectory()
    temporaryDirectories.push(directory)
    const output: string[] = []

    const exitCode = await runCli(["make:migration", "create_users_table"], {
      cwd: directory,
      now: () => new Date(2026, 8, 2, 12, 34, 56),
      loadConfig: async () =>
        createConfig(async () => {
          throw new Error("database must not be opened")
        }),
      output: (message) => output.push(message),
    })

    const migrationPath = join(
      directory,
      "database/migrations/20260902123456_create_users_table.ts",
    )

    await expect(readFile(migrationPath, "utf8")).resolves.toContain(
      'name: "20260902123456_create_users_table"',
    )
    expect(exitCode).toBe(0)
    expect(output[0]).toContain("Migration created")
  })

  it("runs migrate and migrate:rollback through the existing Migrator", async () => {
    const directory = await createTestDirectory()
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "database.sqlite")
    const output: string[] = []
    const loadConfig = async () =>
      createConfig(() => createBetterSqlite3Database(databasePath))
    const loadMigrations = async () => migrations

    await expect(
      runCli(["migrate"], {
        cwd: directory,
        loadConfig,
        loadMigrations,
        output: (message) => output.push(message),
      }),
    ).resolves.toBe(0)
    expect(output).toContain(
      "Migrated: 20260902120000_create_users",
    )

    const database = createBetterSqlite3Database(databasePath)
    await expect(database.all("select * from users")).resolves.toEqual([])
    await database.close()

    await expect(
      runCli(["migrate:rollback"], {
        cwd: directory,
        loadConfig,
        loadMigrations,
        output: (message) => output.push(message),
      }),
    ).resolves.toBe(0)
    expect(output).toContain(
      "Rolled back: 20260902120000_create_users",
    )

    const rolledBackDatabase = createBetterSqlite3Database(databasePath)
    await expect(
      rolledBackDatabase.all(
        "select name from sqlite_master where type = 'table' and name = 'users'",
      ),
    ).resolves.toEqual([])
    await rolledBackDatabase.close()
  })

  it("prints help without loading application configuration", async () => {
    const output: string[] = []

    await expect(
      runCli(["--help"], {
        loadConfig: async () => {
          throw new Error("config must not be loaded")
        },
        output: (message) => output.push(message),
      }),
    ).resolves.toBe(0)

    expect(output.join("\n")).toContain("aiseki migrate")
    expect(output.join("\n")).toContain("make:migration <name>")
  })
})
