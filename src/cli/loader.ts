import { readdir } from "node:fs/promises"
import { extname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import type { Migration } from "../migrations/index.js"
import type { AisekiConfig } from "./config.js"

export const DEFAULT_MIGRATIONS_DIRECTORY = "database/migrations"
const SUPPORTED_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".mts"])

/**
 * `aiseki.config.ts`を読み込む。
 *
 * TypeScriptファイルの実行はCLIの起動元（通常は`tsx`など）に委ねる。
 *
 * @param configPath 設定ファイルの絶対パス。
 * @returns 検証済みのAiseki設定。
 */
export async function loadConfig(configPath: string): Promise<AisekiConfig> {
  const module = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`)
  const config = module.default as Partial<AisekiConfig> | undefined

  if (!config || typeof config.database !== "function") {
    throw new Error(
      `Invalid Aiseki config: ${configPath} must default-export defineConfig(...)`,
    )
  }

  return config as AisekiConfig
}

/**
 * 設定されたディレクトリからmigrationファイルをファイル名順に読み込む。
 *
 * 各ファイルは`defineMigrate(...)`の結果をdefault exportする必要がある。
 *
 * @param directory migrationファイルのディレクトリ。
 * @returns ファイル名順のmigration定義。
 */
export async function loadMigrations(
  directory: string,
): Promise<ReadonlyArray<Migration>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.endsWith(".d.ts") &&
        SUPPORTED_EXTENSIONS.has(extname(entry.name)),
    )
    .map((entry) => entry.name)
    .sort()

  const migrations: Migration[] = []

  for (const file of files) {
    const filePath = resolve(directory, file)
    const module = await import(
      /* @vite-ignore */ `${pathToFileURL(filePath).href}?t=${Date.now()}`,
    )
    const migration = module.default as unknown

    if (!isMigration(migration)) {
      throw new Error(
        `Invalid migration: ${filePath} must default-export defineMigrate(...)`,
      )
    }

    migrations.push(migration)
  }

  return migrations
}

/** デフォルトのmigrationディレクトリを返す。 */
export function getMigrationsDirectory(config: AisekiConfig): string {
  return config.migrations ?? DEFAULT_MIGRATIONS_DIRECTORY
}

function isMigration(value: unknown): value is Migration {
  if (!value || typeof value !== "object") {
    return false
  }

  const migration = value as Partial<Migration>

  return (
    typeof migration.name === "string" &&
    typeof migration.up === "function" &&
    typeof migration.down === "function"
  )
}
