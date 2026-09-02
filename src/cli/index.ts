#!/usr/bin/env node

import { access } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import type {
  ClosableDatabase,
  TransactionalDatabase,
} from "../database.js"
import { Migrator, type Migration } from "../migrations.js"
import { defineConfig, type AisekiConfig } from "./config.js"
import { createMigrationFile } from "./generator.js"
import {
  DEFAULT_MIGRATIONS_DIRECTORY,
  getMigrationsDirectory,
  loadConfig as loadConfigFile,
  loadMigrations as loadMigrationFiles,
} from "./loader.js"

const DEFAULT_CONFIG_FILE = "aiseki.config.ts"

export interface CliOptions {
  cwd?: string
  now?: () => Date
  output?: (message: string) => void
  error?: (message: string) => void
  loadConfig?: (configPath: string) => Promise<AisekiConfig>
  loadMigrations?: (directory: string) => Promise<ReadonlyArray<Migration>>
}

/**
 * Aiseki CLIを実行する。
 *
 * @param argv コマンドライン引数（`process.argv.slice(2)`）。
 * @param options テストや埋め込み実行向けの実行オプション。
 * @returns CLIの終了コード。成功は`0`、失敗は`1`。
 */
export async function runCli(
  argv: readonly string[],
  options: CliOptions = {},
): Promise<number> {
  const output = options.output ?? console.log
  const error = options.error ?? console.error
  const cwd = options.cwd ?? process.cwd()

  try {
    const parsed = parseArguments(argv)

    if (parsed.help || !parsed.command) {
      output(helpText())
      return 0
    }

    const loadConfig = options.loadConfig ?? loadConfigFile
    const loadMigrations = options.loadMigrations ?? loadMigrationFiles

    if (parsed.command === "make:migration") {
      if (parsed.positionals.length !== 1) {
        throw new Error("Usage: aiseki make:migration <name>")
      }

      const configPath = resolve(cwd, parsed.configPath)
      const migrationsDirectory = await getMakeMigrationDirectory({
        cwd,
        configPath,
        configPathExplicit: parsed.configPathExplicit,
        loadConfig,
      })
      const migrationPath = await createMigrationFile({
        directory: migrationsDirectory,
        name: parsed.positionals[0],
        now: options.now?.(),
      })

      output(`Migration created: ${relative(cwd, migrationPath)}`)
      return 0
    }

    if (
      parsed.command !== "migrate" &&
      parsed.command !== "migrate:rollback"
    ) {
      throw new Error(`Unknown command: ${parsed.command}`)
    }

    if (parsed.positionals.length > 0) {
      throw new Error(`Unexpected argument: ${parsed.positionals[0]}`)
    }

    const config = await loadConfig(resolve(cwd, parsed.configPath))
    const migrations = await loadMigrations(
      resolve(cwd, getMigrationsDirectory(config)),
    )
    const database = await config.database()

    try {
      const migrator = new Migrator(database, migrations)
      const names =
        parsed.command === "migrate"
          ? await migrator.migrate()
          : await migrator.rollback()

      if (names.length === 0) {
        output(
          parsed.command === "migrate"
            ? "Nothing to migrate."
            : "Nothing to rollback.",
        )
      } else {
        const verb = parsed.command === "migrate" ? "Migrated" : "Rolled back"
        for (const name of names) {
          output(`${verb}: ${name}`)
        }
      }

      return 0
    } finally {
      await closeDatabase(database)
    }
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause))
    return 1
  }
}

function parseArguments(argv: readonly string[]): {
  command?: string
  configPath: string
  configPathExplicit: boolean
  help: boolean
  positionals: string[]
} {
  const positionals: string[] = []
  let configPath = DEFAULT_CONFIG_FILE
  let configPathExplicit = false
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === "--help" || argument === "-h") {
      help = true
      continue
    }

    if (argument === "--config") {
      const next = argv[index + 1]

      if (!next) {
        throw new Error("Option --config requires a path")
      }

      configPath = next
      configPathExplicit = true
      index += 1
      continue
    }

    if (argument.startsWith("--config=")) {
      configPath = argument.slice("--config=".length)
      configPathExplicit = true
      continue
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`)
    }

    positionals.push(argument)
  }

  return {
    command: positionals[0],
    configPath,
    configPathExplicit,
    help,
    positionals: positionals.slice(1),
  }
}

async function getMakeMigrationDirectory(options: {
  cwd: string
  configPath: string
  configPathExplicit: boolean
  loadConfig: (configPath: string) => Promise<AisekiConfig>
}): Promise<string> {
  if (
    !options.configPathExplicit &&
    !(await fileExists(options.configPath))
  ) {
    return resolve(options.cwd, DEFAULT_MIGRATIONS_DIRECTORY)
  }

  const config = await options.loadConfig(options.configPath)
  return resolve(options.cwd, getMigrationsDirectory(config))
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (cause) {
    if (isMissingFileError(cause)) {
      return false
    }

    throw cause
  }
}

function isMissingFileError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    cause.code === "ENOENT"
  )
}

function helpText(): string {
  return `Usage: aiseki <command> [options]

Commands:
  make:migration <name>  Create a migration file
  migrate                Run pending migrations
  migrate:rollback       Roll back the latest migration batch

Options:
  --config <path>        Use a custom config file
  --help                 Show this help message

Examples:
  aiseki make:migration create_users_table
  aiseki migrate
  aiseki migrate:rollback`
}

async function closeDatabase(database: TransactionalDatabase): Promise<void> {
  const close = (database as Partial<ClosableDatabase>).close

  if (typeof close === "function") {
    await close.call(database)
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode
  })
}

export { defineConfig }
