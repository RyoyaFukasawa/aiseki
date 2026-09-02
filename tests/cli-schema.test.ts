import { execFileSync } from "node:child_process"
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { createBetterSqlite3Database } from "../src/drivers/better-sqlite3/index.js"

const packageRoot = process.cwd()
const builtCli = resolve(packageRoot, "bin/aiseki.mjs")
const temporaryDirectories: string[] = []

beforeAll(() => {
  execFileSync("pnpm", ["run", "build"], {
    cwd: packageRoot,
    stdio: "inherit",
  })
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

function runBuiltCli(cwd: string, ...arguments_: string[]): string {
  return execFileSync(process.execPath, [builtCli, ...arguments_], {
    cwd,
    encoding: "utf8",
  })
}

describe("CLI migration integration", () => {
  it("loads and executes a generated Schema Builder migration through built package exports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiseki-cli-schema-"))
    temporaryDirectories.push(directory)
    await mkdir(join(directory, "node_modules"), { recursive: true })
    await symlink(
      packageRoot,
      join(directory, "node_modules/aiseki"),
      "dir",
    )

    const generateOutput = runBuiltCli(
      directory,
      "make:migration",
      "create_users",
    )
    expect(generateOutput).toContain("Migration created: database/migrations/")

    const migrationDirectory = join(directory, "database/migrations")
    const migrationFiles = await readdir(migrationDirectory)
    expect(migrationFiles).toHaveLength(1)
    const migrationFile = migrationFiles[0]
    const migrationPath = join(migrationDirectory, migrationFile)
    const generatedMigration = await readFile(migrationPath, "utf8")
    await writeFile(
      migrationPath,
      generatedMigration
        .replace(
          "    // スキーマ変更をここに記述する。",
          [
            '    await database.schema.createTable("users", (table) => {',
            "      table.id()",
            '      table.string("name")',
            "    })",
          ].join("\n"),
        )
        .replace(
          "    // スキーマ変更を元に戻す処理をここに記述する。",
          '    await database.schema.dropTable("users")',
        ),
    )
    await writeFile(
      join(directory, "aiseki.config.ts"),
      [
        'import { defineConfig } from "aiseki"',
        'import { createBetterSqlite3Database } from "aiseki/better-sqlite3"',
        "",
        "export default defineConfig({",
        '  database: () => createBetterSqlite3Database("./database.sqlite"),',
        '  migrations: "./database/migrations",',
        "})",
        "",
      ].join("\n"),
    )

    const migrateOutput = runBuiltCli(directory, "migrate")
    expect(migrateOutput).toContain(`Migrated: ${migrationFile.slice(0, -3)}`)

    const database = createBetterSqlite3Database(
      join(directory, "database.sqlite"),
    )
    await expect(
      database.all("pragma table_info(users)"),
    ).resolves.toEqual([
      expect.objectContaining({ name: "id", type: "INTEGER", pk: 1 }),
      expect.objectContaining({ name: "name", type: "TEXT", notnull: 1 }),
    ])
    await database.close()

    const rollbackOutput = runBuiltCli(directory, "migrate:rollback")
    expect(rollbackOutput).toContain(
      `Rolled back: ${migrationFile.slice(0, -3)}`,
    )

    const rolledBackDatabase = createBetterSqlite3Database(
      join(directory, "database.sqlite"),
    )
    await expect(
      rolledBackDatabase.all(
        "select name from sqlite_master where type = 'table' and name = 'users'",
      ),
    ).resolves.toEqual([])
    await rolledBackDatabase.close()
  })
})
